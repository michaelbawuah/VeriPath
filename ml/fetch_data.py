import concurrent.futures
import hashlib
import json
import math
import os
from pathlib import Path
import threading
import time
from datetime import datetime, timezone
import urllib.parse
import urllib.request

import argparse
parser=argparse.ArgumentParser(description='Download complete official NYC public-data snapshots with provenance.')
parser.add_argument('--output',type=Path,required=True)
OUT=parser.parse_args().output
OUT.mkdir(parents=True, exist_ok=True)
ROAD_BASE = 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LION/FeatureServer/0/query'
CRASH_BASE = 'https://data.cityofnewyork.us/resource/h9gi-nx95.json'
ROAD_WHERE = "FeatureTyp IN ('0','6','A','C','W') AND RB_Layer IN ('B','R')"
ROAD_FIELDS = 'SegmentID,PhysicalID,Street,FeatureTyp,NodeIDFrom,NodeIDTo,NodeLevelF,NodeLevelT,RB_Layer,TrafDir,NonPed,StreetWidth_Min,StreetWidth_Max,BikeLane,Number_Travel_Lanes,POSTED_SPEED,Shape__Length'
CRASH_FIELDS = 'collision_id,crash_date,crash_time,latitude,longitude,on_street_name,off_street_name,cross_street_name,borough,number_of_persons_injured,number_of_persons_killed,number_of_pedestrians_injured,number_of_pedestrians_killed,number_of_cyclist_injured,number_of_cyclist_killed,number_of_motorist_injured,number_of_motorist_killed'
CRASH_WHERE = "crash_date >= '2021-01-01T00:00:00.000' AND crash_date < '2026-01-01T00:00:00.000' AND (number_of_persons_injured > 0 OR number_of_persons_killed > 0)"
started = datetime.now(timezone.utc).isoformat()
lock = threading.Lock()
stats = {'requests': 0, 'bytes': 0, 'retried_requests': 0}

def get_json(base, params, timeout=60):
    url = base + '?' + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'VeriPath research snapshot/1.0'})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read()
            data = json.loads(body)
            if isinstance(data, dict) and 'error' in data:
                raise RuntimeError(str(data['error']))
            with lock:
                stats['requests'] += 1
                stats['bytes'] += len(body)
            return data
        except Exception as exc:
            if attempt == 3:
                raise RuntimeError(f'{base}: {exc}') from exc
            with lock:
                stats['retried_requests'] += 1
            print(f'retry {attempt + 1}: {str(exc)[:100]}', flush=True)
            time.sleep(2 ** (attempt + 1))

print('Loading road ID inventory and crash-year counts.', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as preflight:
    road_inventory_future = preflight.submit(get_json, ROAD_BASE, {'where': ROAD_WHERE, 'returnIdsOnly': 'true', 'f': 'json'})
    crash_counts_future = preflight.submit(get_json, CRASH_BASE, {'$query': f'SELECT date_extract_y(crash_date) AS year,count(*) AS n WHERE {CRASH_WHERE} GROUP BY date_extract_y(crash_date) ORDER BY year'})
    road_ids = sorted(road_inventory_future.result()['objectIds'])
    year_counts = {int(row['year']): int(row['n']) for row in crash_counts_future.result()}
print(f'Inventory: {len(road_ids)} road records; injury/fatal crashes {year_counts}.', flush=True)

def road_task(page, ids):
    target = OUT / f'road-page-{page:03d}.json'
    if target.exists():
        data = json.loads(target.read_text())
    else:
        params = {
            'where': f'{ROAD_WHERE} AND OBJECTID >= {ids[0]} AND OBJECTID <= {ids[-1]}',
            'outFields': ROAD_FIELDS,
            'outSR': 4326,
            'orderByFields': 'OBJECTID ASC',
            'geometryPrecision': 6,
            'maxAllowableOffset': 0.00001,
            'resultRecordCount': 2000,
            'f': 'geojson',
        }
        data = get_json(ROAD_BASE, params)
        target.write_text(json.dumps(data, separators=(',', ':')))
    features = data.get('features', [])
    if len(features) != len(ids):
        raise RuntimeError(f'Road page {page}: expected {len(ids)} records, got {len(features)}; inventory changed or transfer incomplete')
    if data.get('properties', {}).get('exceededTransferLimit'):
        raise RuntimeError(f'Road page {page}: transfer limit exceeded')
    if page % 10 == 0:
        print(f'Road page {page + 1}/{math.ceil(len(road_ids) / 2000)} complete.', flush=True)
    return ('roads', page, features)

def crash_task(year, offset, expected):
    target = OUT / f'crash-{year}-{offset:05d}.json'
    query = f"SELECT {CRASH_FIELDS} WHERE crash_date >= '{year}-01-01T00:00:00.000' AND crash_date < '{year + 1}-01-01T00:00:00.000' AND (number_of_persons_injured > 0 OR number_of_persons_killed > 0) ORDER BY collision_id ASC LIMIT 25000 OFFSET {offset}"
    if target.exists():
        rows = json.loads(target.read_text())
    else:
        rows = get_json(CRASH_BASE, {'$query': query}, timeout=90)
        if not isinstance(rows, list):
            raise RuntimeError(f'Invalid crash response for {year}')
        target.write_text(json.dumps(rows, separators=(',', ':')))
    if len(rows) != expected:
        raise RuntimeError(f'Crash page {year}/{offset}: expected {expected}, got {len(rows)}')
    print(f'Crash {year}, offset {offset}: {len(rows)} records complete.', flush=True)
    return ('crashes', (year, offset), rows)

road_results = {}
crash_results = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures = []
    # Start crash reads first because these larger Socrata requests can be slower.
    for year, count in sorted(year_counts.items()):
        for offset in range(0, count, 25000):
            futures.append(pool.submit(crash_task, year, offset, min(25000, count - offset)))
    for page, begin in enumerate(range(0, len(road_ids), 2000)):
        futures.append(pool.submit(road_task, page, road_ids[begin:begin + 2000]))
    for future in concurrent.futures.as_completed(futures):
        source, key, records = future.result()
        (road_results if source == 'roads' else crash_results)[key] = records

road_by_id = {}
geometry_conflicts = []
duplicate_road_records = 0
for page in sorted(road_results):
    for feature in road_results[page]:
        props = feature['properties']
        for key, value in list(props.items()):
            if isinstance(value, str):
                props[key] = value.strip()
        segment_id = props['SegmentID']
        if not segment_id:
            raise RuntimeError('Road record missing SegmentID')
        if segment_id not in road_by_id:
            props['aliases'] = [props['Street']] if props.get('Street') else []
            road_by_id[segment_id] = feature
        else:
            duplicate_road_records += 1
            prior = road_by_id[segment_id]
            if prior['geometry'] != feature['geometry']:
                geometry_conflicts.append(segment_id)
            if props.get('Street') and props['Street'] not in prior['properties']['aliases']:
                prior['properties']['aliases'].append(props['Street'])
roads = {'type': 'FeatureCollection', 'features': [road_by_id[key] for key in sorted(road_by_id)]}

crash_by_id = {}
for key in sorted(crash_results):
    for row in crash_results[key]:
        for field in ('latitude', 'longitude'):
            try:
                row[field] = float(row[field]) if row.get(field) is not None else None
            except (ValueError, TypeError):
                row[field] = None
        for field in row:
            if field.startswith('number_of_'):
                row[field] = int(float(row[field])) if row[field] is not None else None
        for field in ('on_street_name', 'off_street_name', 'cross_street_name', 'borough'):
            if row.get(field):
                row[field] = row[field].strip()
        crash_by_id[row['collision_id']] = row
crashes = [crash_by_id[key] for key in sorted(crash_by_id, key=int)]
missing_coordinates = sum(row['latitude'] is None or row['longitude'] is None for row in crashes)
invalid_coordinates = sum(row['latitude'] is not None and row['longitude'] is not None and not (-74.3 <= row['longitude'] <= -73.65 and 40.45 <= row['latitude'] <= 40.95) for row in crashes)
if len(crashes) != sum(year_counts.values()):
    raise RuntimeError('Crash count/unique IDs differ from inventory')

def write_asset(name, data):
    payload = json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode()
    target = OUT / name
    temporary = target.with_suffix('.tmp')
    temporary.write_bytes(payload)
    os.replace(temporary, target)
    return {'path': str(target), 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}

assets = {'roads': write_asset('roads.json', roads), 'crashes': write_asset('crashes.json', crashes)}
manifest = {
    'startedAt': started,
    'completedAt': datetime.now(timezone.utc).isoformat(),
    'sources': {
        'roads': {'publisher': 'NYC Department of City Planning', 'endpoint': ROAD_BASE, 'where': ROAD_WHERE, 'fields': ROAD_FIELDS, 'outSR': 4326, 'geometryPrecision': 6, 'maxAllowableOffset': 0.00001, 'pagination': 'Stable sorted OBJECTID inventory; batches of 2000 selected records bounded by OBJECTID', 'officialDataset': 'https://data.cityofnewyork.us/City-Government/LION/2v4z-66xt'},
        'crashes': {'publisher': 'NYPD / NYC Open Data', 'endpoint': CRASH_BASE, 'where': CRASH_WHERE, 'fields': CRASH_FIELDS, 'pagination': 'Per calendar year, ORDER BY collision_id ASC LIMIT 25000 OFFSET n', 'officialDataset': 'https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95'},
    },
    'counts': {'roadSourceRecords': len(road_ids), 'uniqueRoadSegments': len(road_by_id), 'duplicateRoadRecords': duplicate_road_records, 'geometryConflictSegments': len(set(geometry_conflicts)), 'crashSourceRecords': sum(year_counts.values()), 'uniqueCrashes': len(crashes), 'crashCountsByYear': year_counts, 'crashesMissingCoordinates': missing_coordinates, 'crashesOutsideBroadNYCBounds': invalid_coordinates},
    'geometryConflictSegmentIds': sorted(set(geometry_conflicts)),
    'assets': assets,
    'requests': stats,
    'caveats': [
        'Road matching remains an inferred geographic association; coordinates can be erroneous, intersections ambiguous, and stacked roads geometrically coincident.',
        'Shape__Length is source-planar feet, not meters; divide/convert correctly and avoid treating source length as live route distance.',
        'LION snapshot uses current road features; using those features for older crash prediction requires accounting for temporal leakage and changed infrastructure.',
        'Deduplicated roads preserve the first record in ascending OBJECTID order plus aliases; geometry conflicts are explicitly recorded.',
        'Geometry generalization maxAllowableOffset 0.00001 degrees is approximately one meter and is not a surveyed-accuracy guarantee.',
        'NYC police-reported crash records are preliminary/amendable and exclude unreported crashes; missing/invalid locations are retained for audit.',
        'Neither snapshot measures exposure; traffic samples cover too few segments for citywide calibrated per-trip risk claims.',
        'Public datasets are not transactionally locked during download. Record inventories, page counts, unique IDs and file hashes were checked.',
    ],
}
write_asset('manifest.json', manifest)
print(json.dumps({'complete': True, 'assets': assets, 'manifest': str(OUT / 'manifest.json'), 'counts': manifest['counts'], 'requests': stats}), flush=True)
