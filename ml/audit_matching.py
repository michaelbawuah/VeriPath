"""Coverage audit and blinded review material; never infer accuracy from rules."""
import argparse, collections, csv, hashlib, json, math, pathlib, subprocess
SX=111320*.7575649843840493;SY=110540
MODES={'auto':['number_of_motorist_injured','number_of_motorist_killed'],'bicycle':['number_of_cyclist_injured','number_of_cyclist_killed'],'pedestrian':['number_of_pedestrians_injured','number_of_pedestrians_killed']}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def text(v):return str(v or '').strip().replace('\t',' ').replace('\n',' ')
def points(r):return r['geometry']['coordinates'] if r['geometry']['type']=='LineString' else max(r['geometry']['coordinates'],key=len)
def distance(p,line):
 best=float('inf')
 for a,b in zip(line,line[1:]):
  ax=(a[0]-p[0])*SX;ay=(a[1]-p[1])*SY;dx=(b[0]-a[0])*SX;dy=(b[1]-a[1])*SY;den=dx*dx+dy*dy;t=max(0,min(1,-(ax*dx+ay*dy)/den)) if den else 0;best=min(best,math.hypot(ax+t*dx,ay+t*dy))
 return best
def coordinate(c):
 try:p=[float(c['longitude']),float(c['latitude'])]
 except (KeyError,ValueError,TypeError):return None
 return p if all(math.isfinite(x) for x in p) else None
def usable(p):return p is not None and -74.26<=p[0]<=-73.70 and 40.49<=p[1]<=40.93
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--data',type=pathlib.Path,required=True);parser.add_argument('--matcher',type=pathlib.Path,required=True);parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path('public/quality'));parser.add_argument('--evaluator-output',type=pathlib.Path,default=pathlib.Path('ml/audit'));args=parser.parse_args();args.output.mkdir(exist_ok=True,parents=True);args.evaluator_output.mkdir(exist_ok=True,parents=True)
 raw=json.loads((args.data/'roads.json').read_text());raw=raw['features'] if isinstance(raw,dict) else raw;crashes=list({str(c['collision_id']):c for c in json.loads((args.data/'crashes.json').read_text())}.values());manifest=json.loads((args.data/'manifest.json').read_text());quarantine=set(manifest['geometryConflictSegmentIds']);roads=[]
 with (args.data/'quality-roads.tsv').open('w') as out:
  for r in raw:
   p=r['properties'];line=points(r);road_id=text(p['SegmentID']);levels='QQ' if road_id in quarantine else text(p.get('NodeLevelF'))+text(p.get('NodeLevelT'));names=p.get('aliases') or [p.get('Street')];has_nodes=r['geometry']['type']=='LineString';road={'id':road_id,'physical':text(p.get('PhysicalID')) or road_id,'street':text(p.get('Street')),'aliases':names,'levels':text(p.get('NodeLevelF'))+text(p.get('NodeLevelT')),'coordinates':line,'from':text(p.get('NodeIDFrom')) if has_nodes else '', 'to':text(p.get('NodeIDTo')) if has_nodes else ''};roads.append(road)
   out.write('\t'.join([road_id,road['physical'],'|'.join(text(n).replace('|',' ') for n in names),levels,';'.join(f'{a},{b}' for a,b in line),road['from'],road['to']])+'\n')
 with (args.data/'quality-crashes.tsv').open('w') as out:
  for c in crashes:
   p=coordinate(c)
   if usable(p):out.write('\t'.join([str(c['collision_id']),str(p[0]),str(p[1]),text(c.get('on_street_name')) or '_',text(c.get('off_street_name')) or '_'])+'\n')
 assignments={}
 with (args.data/'quality-assignments.tsv').open('w') as out:subprocess.run([str(args.matcher),str(args.data/'quality-roads.tsv'),str(args.data/'quality-crashes.tsv'),'--intersections'],stdout=out,check=True)
 with (args.data/'quality-assignments.tsv').open() as file:assignments={row['id']:row for row in csv.DictReader(file,delimiter='\t')}
 rows=[];counts=collections.Counter();by_borough=collections.defaultdict(collections.Counter);by_mode=collections.defaultdict(collections.Counter);by_year=collections.defaultdict(collections.Counter);strata=collections.defaultdict(list)
 for c in crashes:
  p=coordinate(c);prediction=assignments.get(str(c['collision_id']));status=prediction['status'] if prediction else 'missing_coordinates' if p is None else 'outside_bounding_area';borough=text(c.get('borough')) or 'Unknown';modes=[mode for mode,fields in MODES.items() if sum(float(c.get(field) or 0) for field in fields)>0];item={'record':c,'coordinate':p,'status':status,'borough':borough,'modes':modes};rows.append(item);counts[status]+=1;by_borough[borough][status]+=1;by_year[str(c['crash_date'])[:4]][status]+=1
  for mode in modes:by_mode[mode][status]+=1
  strata[(borough,status)].append(item)
 # Proportional stratified sample, minimum two per nonempty stratum. Hash-ranked
 # IDs give a reproducible uniform-within-stratum selection without duplicates.
 budget=min(200,len(rows))
 if not budget or sum(min(2,len(v)) for v in strata.values())>budget:raise ValueError('Sample budget cannot cover every stratum with the minimum allocation')
 seed='veripath-review-2026-10-08-v1';rank=lambda row:hashlib.sha256((seed+str(row['record']['collision_id'])).encode()).hexdigest();allocation={k:min(len(v),max(2,int(budget*len(v)/len(rows)))) for k,v in strata.items()}
 while sum(allocation.values())<budget:
  eligible=[k for k,v in strata.items() if allocation[k]<len(v)];key=max(eligible,key=lambda k:budget*len(strata[k])/len(rows)-allocation[k]);allocation[key]+=1
 while sum(allocation.values())>budget:
  eligible=[k for k in allocation if allocation[k]>min(2,len(strata[k]))];key=max(eligible,key=lambda k:allocation[k]-budget*len(strata[k])/len(rows));allocation[key]-=1
 selected=[]
 for key,population in sorted(strata.items()):
  for item in sorted(population,key=rank)[:allocation[key]]:selected.append((item,'representative',len(population),allocation[key]))
 ids={str(item['record']['collision_id']) for item,*_ in selected};challenge=[item for item in rows if str(item['record']['collision_id']) not in ids and item['status'] in ('intersection','ambiguous') and usable(item['coordinate'])];challenge.sort(key=lambda row:hashlib.sha256(('challenge'+rank(row)).encode()).hexdigest());selected.extend((item,'challenge',None,None) for item in challenge[:60])
 # Keep every nearby road as a competitor, including unknown/elevated geometry.
 buckets=collections.defaultdict(set)
 for i,road in enumerate(roads):
  cells=set()
  for a,b in zip(road['coordinates'],road['coordinates'][1:]):
   for x in range(math.floor(min(a[0],b[0])*SX/100),math.floor(max(a[0],b[0])*SX/100)+1):
    for y in range(math.floor(min(a[1],b[1])*SY/100),math.floor(max(a[1],b[1])*SY/100)+1):cells.add((x,y))
  for cell in cells:buckets[cell].add(i)
 cases=[];predictions={};sampling={};sample_strata=[]
 for key,population in sorted(strata.items()):sample_strata.append({'borough':key[0],'status':key[1],'population':len(population),'selected':allocation[key],'inclusionProbability':allocation[key]/len(population)})
 for item,cohort,population,n in selected:
  c=item['record'];p=item['coordinate'];near=[]
  if usable(p):
   gx=math.floor(p[0]*SX/100);gy=math.floor(p[1]*SY/100);indices=set().union(*(buckets.get((x,y),set()) for x in range(gx-1,gx+2) for y in range(gy-1,gy+2)));near=[roads[i] for i in sorted(indices,key=lambda i:roads[i]['id']) if distance(p,roads[i]['coordinates'])<=60]
  case={'id':str(c['collision_id']),'date':str(c['crash_date'])[:10],'borough':item['borough'],'coordinate':p,'onStreet':text(c.get('on_street_name')),'nearestCrossStreet':text(c.get('off_street_name')),'locationText':text(c.get('cross_street_name')),'modes':item['modes'],'roads':near};cases.append(case);sampling[case['id']]={'cohort':cohort,'population':population,'selectedInStratum':n,'inclusionProbability':n/population if population else None};prediction=assignments.get(case['id'],{});predictions[case['id']]={'status':item['status'],'roadId':prediction.get('road_id') or None,'nodeId':prediction.get('node_id') or None}
 report={'schemaVersion':1,'algorithm':'Ground street segments and conservative named shared-node contexts, v2','snapshotWindow':'2021–2025','records':len(rows),'counts':dict(counts),'byBorough':dict(by_borough),'byMode':dict(by_mode),'byYear':dict(by_year),'streetFields':{'on_street_name':'Reported collision street','off_street_name':'Nearest cross street; not proof of intersection involvement','cross_street_name':'Address/location text; never used as a cross-street pair'},'rules':{'segmentMaximumMeters':20,'nodeMaximumMeters':15,'nodeMarginMeters':10,'nodeEndpointCoherenceMeters':3,'routeNodeProximityMeters':12,'routeNodeEndpointExclusionMeters':15,'routeNodeBranchSampleMeters':[5,45],'routeNodeMinimumBranchAngleDegrees':60,'requireBothStreetNames':True,'requireDistinctStreetFamiliesAndPhysicalIds':True,'groundOnly':True},'review':{'representativeCases':sum(c['cohort']=='representative' for c in sampling.values()),'challengeCases':sum(c['cohort']=='challenge' for c in sampling.values()),'reviewed':0,'accuracy':None,'status':'Awaiting independent review; coverage is not correctness','seed':seed,'strata':sample_strata},'sources':{'crashes':'https://data.cityofnewyork.us/resource/h9gi-nx95.json','roads':'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LION/FeatureServer/0'},'hashes':{'crashes':digest(args.data/'crashes.json'),'roads':digest(args.data/'roads.json'),'matcher':digest(pathlib.Path('engine/road_matcher.cpp')),'intersections':digest(pathlib.Path('engine/intersections.hpp')),'audit':digest(pathlib.Path(__file__)),'browserMatcher':digest(pathlib.Path('lib/road-matching.ts')),'browserIntersections':digest(pathlib.Path('lib/intersections.ts')),'quarantine':digest(pathlib.Path('lib/road-quarantine.json')),'matcherBinary':digest(args.matcher)},'limitations':['Current road geometry is used retrospectively.','Intersection association is context, not responsibility, approach, turn or risk.','Rules have not been independently calibrated.','Missing-coordinate records remain in the overall coverage denominator.','Mode groups overlap; a collision counts once overall.','Challenge cases sample named-node and ambiguous assignments; they do not guarantee coverage of every difficult topology or estimate population accuracy.','Review blinding hides predictions and sampling strata in the interface; repository access is not a secure barrier.']}
 cases.sort(key=lambda c:hashlib.sha256(('presentation'+seed+c['id']).encode()).hexdigest())
 (args.evaluator_output/'sampling.json').write_text(json.dumps(sampling,separators=(',',':')));(args.evaluator_output/'predictions.json').write_text(json.dumps(predictions,separators=(',',':')));(args.output/'predictions.json').unlink(missing_ok=True)
 (args.output/'cases.json').write_text(json.dumps(cases,separators=(',',':')))
 report['hashes'].update({'reviewCases':digest(args.output/'cases.json'),'sampling':digest(args.evaluator_output/'sampling.json'),'predictions':digest(args.evaluator_output/'predictions.json')})
 (args.output/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'records':len(rows),'counts':dict(counts),'sample':len(cases),'casesBytes':(args.output/'cases.json').stat().st_size}),flush=True)
if __name__=='__main__':main()
