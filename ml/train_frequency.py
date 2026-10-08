"""Reproducible road-level annual police injury-crash forecasts, not per-trip risk.

2021 lag history; 2022-23 train; 2024 tuning; 2025 final temporal test.
Current LION geometry is a retrospective assignment reference, not archived road design.
"""
from __future__ import annotations
import argparse, collections, csv, hashlib, json, math, pathlib, subprocess
import numpy as np
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import mean_poisson_deviance, mean_absolute_error
from sklearn.preprocessing import StandardScaler

MODES={'bicycle':('number_of_cyclist_injured','number_of_cyclist_killed'), 'pedestrian':('number_of_pedestrians_injured','number_of_pedestrians_killed'), 'auto':('number_of_motorist_injured','number_of_motorist_killed')}
YEARS=range(2021,2026)
FEATURES=['log_length_m','log_previous_year_count','log_prior_history_mean']
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def fields(road): return road['properties']
def line(road):
    geometry=road['geometry']; return geometry['coordinates'] if geometry['type']=='LineString' else max(geometry['coordinates'],key=len)
def clean(value): return str(value or '').strip().replace('\t',' ').replace('\n',' ')
def length(points):
    return sum(math.hypot((b[0]-a[0])*111320*math.cos((a[1]+b[1])*math.pi/360),(b[1]-a[1])*110540) for a,b in zip(points,points[1:]))
def feature_matrix(lengths,counts,year):
    # All counts used here precede the forecast cutoff. No target-year labels.
    history=counts[:,[y-2021 for y in range(max(2021,year-3),year)]].mean(axis=1)
    return np.column_stack([np.log(np.maximum(lengths,5)),np.log1p(counts[:,year-2022]),np.log1p(history)])
def baselines(lengths,counts,year,training_target,training_lengths):
    history=counts[:,[y-2021 for y in range(max(2021,year-3),year)]].mean(axis=1)
    mean=float(np.mean(training_target)); rate=float(np.sum(training_target)/np.sum(training_lengths))
    return {'city_mean':np.full(len(lengths),max(mean,1e-6)), 'length_only':np.maximum(lengths*rate,1e-6), 'previous_year':np.maximum(counts[:,year-2022],1e-6), 'history_mean':np.maximum(history,1e-6), 'smoothed_history':np.maximum((history+mean)/2,1e-6)}
def metrics(y,p): return {'poisson_deviance':float(mean_poisson_deviance(y,np.maximum(p,1e-9))), 'mae':float(mean_absolute_error(y,p)), 'observed':int(y.sum()),'predicted':float(p.sum()),'observed_predicted_ratio':float(y.sum()/p.sum()) if p.sum() else None}
def calibration(y,p):
    order=np.argsort(p);return [{'n':len(index),'observed':int(y[index].sum()),'predicted':float(p[index].sum())} for index in np.array_split(order,10)]
def improvement_interval(y,p,baseline,blocks):
    # Paired geographic-block bootstrap preserves local dependence better than
    # resampling individual roads. Descriptive uncertainty, not a safety trial.
    def loss(prediction):
        return 2*(y*np.log(np.maximum(y,1e-12)/np.maximum(prediction,1e-12))-y+prediction)
    _,inverse=np.unique(blocks,axis=0,return_inverse=True)
    model_loss=np.bincount(inverse,weights=loss(p));baseline_loss=np.bincount(inverse,weights=loss(baseline));rng=np.random.default_rng(2026)
    values=[]
    for _ in range(1000):
        sample=rng.integers(0,len(model_loss),len(model_loss));values.append(1-model_loss[sample].sum()/baseline_loss[sample].sum())
    return np.quantile(values,[.025,.975]).tolist()
def release_gate(improvement,interval,ratio,bins):
    calibration_pass=all(.5<=item['observed']/item['predicted']<=2 for item in bins if item['observed']>=30 and item['predicted']>0)
    return bool(improvement>0 and interval[0]>0 and ratio is not None and .8<=ratio<=1.2 and calibration_pass),calibration_pass
def coefficients(model,scaler):
    coefficients=model.coef_/scaler.scale_;intercept=model.intercept_-float(np.dot(coefficients,scaler.mean_));return {'intercept':float(intercept),'coefficients':coefficients.tolist(),'features':FEATURES}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--data',type=pathlib.Path,required=True);parser.add_argument('--matcher',type=pathlib.Path,required=True);parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path('public/model'));args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    source_roads=json.loads((args.data/'roads.json').read_text());source_roads=source_roads['features'] if isinstance(source_roads,dict) else source_roads
    quarantine=set(json.loads((args.data/'manifest.json').read_text())['geometryConflictSegmentIds'])
    roads=[r for r in source_roads if clean(fields(r)['SegmentID']) not in quarantine and clean(fields(r).get('NodeLevelF'))=='M' and clean(fields(r).get('NodeLevelT'))=='M' and len(line(r))>=2 and 5<=length(line(r))<=3000]
    roads.sort(key=lambda r:clean(fields(r)['SegmentID'])); ids=[clean(fields(r)['SegmentID']) for r in roads];by_id={road_id:i for i,road_id in enumerate(ids)};lengths=np.array([length(line(r)) for r in roads]);crashes=json.loads((args.data/'crashes.json').read_text());crashes=list({str(c['collision_id']):c for c in crashes}.values())
    with (args.data/'roads.tsv').open('w') as out:
        # Retain ineligible/quarantined geometry as competing candidates. Removing
        # it could incorrectly turn a neighboring road into an unambiguous match.
        for r in source_roads:
            if len(line(r))<2:continue
            p=fields(r);levels='QQ' if clean(p['SegmentID']) in quarantine else clean(p.get('NodeLevelF'))+clean(p.get('NodeLevelT'))
            aliases=p.get('aliases') or [p.get('Street')];out.write('\t'.join([clean(p['SegmentID']),clean(p.get('PhysicalID')) or clean(p['SegmentID']),'|'.join(clean(alias).replace('|',' ') for alias in aliases),levels, ';'.join(f'{a},{b}' for a,b in line(r))])+'\n')
    valid=[]
    with (args.data/'crashes.tsv').open('w') as out:
        for c in crashes:
            try:lon,lat=float(c['longitude']),float(c['latitude'])
            except (TypeError,ValueError,KeyError):continue
            if not (-74.26<=lon<=-73.70 and 40.49<=lat<=40.93):continue
            valid.append(c);out.write(f"{c['collision_id']}\t{lon}\t{lat}\t{clean(c.get('on_street_name')) or '_'}\n")
    with (args.data/'assignments.tsv').open('w') as out:subprocess.run([str(args.matcher),str(args.data/'roads.tsv'),str(args.data/'crashes.tsv')],stdout=out,check=True)
    matches={r['id']:r for r in csv.DictReader((args.data/'assignments.tsv').open(),delimiter='\t')};audit=collections.Counter(m['status'] for m in matches.values()); yearly={}
    mode_counts={mode:np.zeros((len(roads),5),dtype=float) for mode in MODES}
    for year in YEARS:
        ys=[c for c in crashes if str(c['crash_date']).startswith(str(year))];ys_valid=[c for c in ys if str(c['collision_id']) in matches];ys_strong=[c for c in ys_valid if matches[str(c['collision_id'])]['status']=='strong'];yearly[str(year)]={'records':len(ys),'usable_coordinates':len(ys_valid),'strong_assignments':len(ys_strong),'eligible_strong_assignments':sum(matches[str(c['collision_id'])]['road_id'] in by_id for c in ys_strong),'excluded_missing_or_outside':len(ys)-len(ys_valid)}
    for c in valid:
        m=matches[str(c['collision_id'])]
        if m['status']!='strong' or m['road_id'] not in by_id:continue
        year=int(str(c['crash_date'])[:4]);index=by_id[m['road_id']]
        if year not in YEARS:continue
        for mode,keys in MODES.items():
            if sum(float(c.get(key) or 0) for key in keys)>0:mode_counts[mode][index,year-2021]+=1
    centers=np.array([np.mean(line(r),axis=0) for r in roads]);blocks=np.floor((centers-np.array([-74.26,40.49]))*np.array([84340,110540])/2000).astype(int);spatial_holdout=((blocks[:,0]*73856093+blocks[:,1]*19349663)%4)==0
    report={'target':'Distinct police-reported crashes with chosen-mode injury/death assigned to unambiguous ground-level road segments; annual count', 'scope':'NYC LION roadbed segments','forecast_year':2026,'split':{'history':2021,'training':[2022,2023],'tuning':2024,'test':2025},'road_segments':len(roads),'zero_segments_included':True,'matching':{'maximum_distance_m':35,'strong_distance_m':20,'named_margin_m':6,'unnamed_margin_m':12,'assignment_counts':dict(audit),'ground_level_only':True},'yearly_audit':yearly,'code_hashes':{'trainer':sha(pathlib.Path(__file__)),'matcher':sha(pathlib.Path('engine/road_matcher.cpp'))},'quarantined_road_ids':sorted(quarantine),'data_hashes':{name:sha(args.data/name) for name in ['roads.json','crashes.json']},'limitations':['Frequency of strongly assigned police reports, not per-trip risk; no traffic-exposure denominator.','Ambiguous intersections, elevated roads, tunnels and unmatched records are excluded.','Current LION geometry is used retrospectively; road redesign changes and under-reporting are not modelled.','Forecast year 2026; no observed 2026 target data used.'],'modes':{}}
    forecast={road_id:{'lengthMeters':round(float(lengths[i]),2),'coordinate':centers[i].tolist(),'previousYear':{},'historyMean':{},'forecast':{}} for i,road_id in enumerate(ids)}
    for mode,counts in mode_counts.items():
        train_x=np.vstack([feature_matrix(lengths,counts,year) for year in (2022,2023)]);train_y=np.concatenate([counts[:,year-2021] for year in (2022,2023)]);scaler=StandardScaler().fit(train_x);training_lengths=np.tile(lengths,2)
        tune_x=feature_matrix(lengths,counts,2024);tune_y=counts[:,3];tune_baselines=baselines(lengths,counts,2024,train_y,training_lengths);best_baseline=min(tune_baselines,key=lambda name:metrics(tune_y,tune_baselines[name])['poisson_deviance'])
        fitted=[]
        for alpha in (0.05,0.5,5.,50.):
            model=PoissonRegressor(alpha=alpha,max_iter=300,tol=1e-7).fit(scaler.transform(train_x),train_y);score=metrics(tune_y,model.predict(scaler.transform(tune_x)));fitted.append((score['poisson_deviance'],alpha,model,score))
        _,alpha,model,tune_score=min(fitted,key=lambda t:t[0]);test_x=feature_matrix(lengths,counts,2025);test_y=counts[:,4];prediction=model.predict(scaler.transform(test_x));test_baselines=baselines(lengths,counts,2025,train_y,training_lengths);score=metrics(test_y,prediction);base_score=metrics(test_y,test_baselines[best_baseline]);improvement=1-score['poisson_deviance']/base_score['poisson_deviance'];ratio=score['observed_predicted_ratio'];enabled=improvement>0 and ratio is not None and 0.8<=ratio<=1.2
        bins=calibration(test_y,prediction);interval=improvement_interval(test_y,prediction,test_baselines[best_baseline],blocks);enabled,calibration_pass=release_gate(improvement,interval,ratio,bins)
        spatial_train=np.tile(~spatial_holdout,2);spatial_scaler=StandardScaler().fit(train_x[spatial_train]);spatial_candidates=[]
        for spatial_alpha in (0.05,0.5,5.,50.):
            spatial_model=PoissonRegressor(alpha=spatial_alpha,max_iter=300,tol=1e-7).fit(spatial_scaler.transform(train_x[spatial_train]),train_y[spatial_train]);spatial_candidates.append((metrics(tune_y[~spatial_holdout],spatial_model.predict(spatial_scaler.transform(tune_x[~spatial_holdout])))['poisson_deviance'],spatial_alpha,spatial_model))
        _,spatial_alpha,spatial_model=min(spatial_candidates,key=lambda item:item[0]);spatial_score=metrics(test_y[spatial_holdout],spatial_model.predict(spatial_scaler.transform(test_x[spatial_holdout])))
        refit_x=np.vstack([feature_matrix(lengths,counts,year) for year in (2022,2023,2024,2025)]);refit_y=np.concatenate([counts[:,year-2021] for year in (2022,2023,2024,2025)]);final_scaler=StandardScaler().fit(refit_x);final_model=PoissonRegressor(alpha=alpha,max_iter=300,tol=1e-7).fit(final_scaler.transform(refit_x),refit_y);next_prediction=final_model.predict(final_scaler.transform(feature_matrix(lengths,counts,2026)))
        report['modes'][mode]={'enabled':bool(enabled),'alpha_selected_on_2024':alpha,'tuning':tune_score,'test':score,'strongest_baseline_selected_on_2024':best_baseline,'baseline_test':base_score,'all_baselines_test':{name:metrics(test_y,p) for name,p in test_baselines.items()},'deviance_improvement_fraction':float(improvement),'calibration_deciles':calibration(test_y,prediction),'spatial_block_test':{'block_meters':2000,'held_out_segments':int(spatial_holdout.sum()),'alpha_selected_on_nonheldout_2024':spatial_alpha,'local_past_history_available':True,'description':'Coefficient transfer to held-out blocks with local prior-year counts; not cold-start validation','metrics':spatial_score},'deployed_coefficients':coefficients(final_model,final_scaler)}
        for i,road_id in enumerate(ids):
            forecast[road_id]['previousYear'][mode]=int(counts[i,4]);forecast[road_id]['historyMean'][mode]=round(float(counts[i,2:5].mean()),4);forecast[road_id]['forecast'][mode]=round(float(next_prediction[i]),5)
        report['modes'][mode]['improvement_95pct_geographic_block_interval']=interval;report['modes'][mode]['calibration_gate_passed']=calibration_pass
        print(f'{mode}: temporal deviance {score["poisson_deviance"]:.5f}, baseline {base_score["poisson_deviance"]:.5f}, improvement {improvement:.1%}, enabled={enabled}',flush=True)
    report['retrieved_manifest']=json.loads((args.data/'manifest.json').read_text());(args.output/'validation.json').write_text(json.dumps(report,indent=2));(args.output/'road-forecasts.json').write_text(json.dumps(forecast,separators=(',',':')))
    partition=collections.defaultdict(dict)
    for road_id, values in forecast.items(): partition[road_id[:3]][road_id]=[values['forecast']['auto'],values['forecast']['bicycle'],values['forecast']['pedestrian']]
    (args.output/'roads').mkdir(exist_ok=True)
    for prefix,values in partition.items(): (args.output/'roads'/f'{prefix}.json').write_text(json.dumps(values,separators=(',',':')))
    # Large research table is an intermediate; browser loads only compact relevant partitions.
    (args.output/'road-forecasts.json').unlink()
    print(f'Saved {len(roads)} road forecasts and honest holdout evaluation.',flush=True)
if __name__=='__main__':main()
