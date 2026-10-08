import { isNYCCoordinate, nearbyCrashes, type Crash, type Coordinate, type PlanResult, type PlannedRoute, type TravelMode } from "@/lib/veripath";
import { fetchRoads, matchRouteEvidence, type RouteStep } from "@/lib/road-matching";
const ROUTER="https://valhalla1.openstreetmap.de/route";
const DATA="https://data.cityofnewyork.us/resource/h9gi-nx95.json";
const WINDOW="2024–2025",RADIUS=60,LIMIT=10000;
type RawCrash={collision_id?:string;crash_date?:string;latitude?:string;longitude?:string;number_of_persons_injured?:string;number_of_persons_killed?:string;on_street_name?:string};
export async function fetchTrip(origin:Coordinate,destination:Coordinate,travelMode:TravelMode,signal?:AbortSignal):Promise<PlanResult> {
    const payload={locations:[{lat:origin[1],lon:origin[0]},{lat:destination[1],lon:destination[0]}],costing:travelMode,alternates:2,units:"kilometers",format:"osrm",shape_format:"geojson"};
    const response=await fetch(`${ROUTER}?json=${encodeURIComponent(JSON.stringify(payload))}`,{signal:AbortSignal.any([AbortSignal.timeout(18000),...(signal?[signal]:[])])});
    if(!response.ok)throw new Error("The routing service is temporarily unavailable. Please try again in a moment.");
    const data=await response.json() as {code?:string;routes?:{duration:number;distance:number;geometry:{type:string;coordinates:Coordinate[]};legs?:{steps?:{name?:string;geometry?:{type:string;coordinates:Coordinate[]}}[]}[]}[]};
    const routes:PlannedRoute[]=(data.routes||[]).slice(0,3).filter(r=>Number.isFinite(r.duration)&&r.duration>0&&Number.isFinite(r.distance)&&r.distance>0&&r.geometry?.type==="LineString"&&Array.isArray(r.geometry.coordinates)&&r.geometry.coordinates.length>=2&&r.geometry.coordinates.length<=12000&&r.geometry.coordinates.every(isNYCCoordinate)).map((r,i)=>({id:`route-${i}`,seconds:r.duration,meters:r.distance,coordinates:r.geometry.coordinates,crashes:[],steps:(r.legs||[]).flatMap(leg=>(leg.steps||[]).filter(step=>step.geometry?.type==="LineString"&&Array.isArray(step.geometry.coordinates)&&step.geometry.coordinates.length>=2&&step.geometry.coordinates.every(isNYCCoordinate)).map(step=>({street:step.name||"",coordinates:step.geometry!.coordinates}))) as RouteStep[]})).sort((a,b)=>a.seconds-b.seconds);
    if(!routes.length)throw new Error("No supported route was found. Try another pair of locations.");
    const routingFetchedAt=new Date().toISOString();
    const value:PlanResult={routes,crashes:[],routingFetchedAt,evidence:{available:false,truncated:false,fetchedAt:"",recordsInArea:0,window:WINDOW,radiusMeters:RADIUS}};
    const points=routes.flatMap(r=>r.coordinates);
    const west=Math.min(...points.map(p=>p[0]))-0.001,east=Math.max(...points.map(p=>p[0]))+0.001;
    const south=Math.min(...points.map(p=>p[1]))-0.001,north=Math.max(...points.map(p=>p[1]))+0.001;
    const modeFields=travelMode==="bicycle"?["number_of_cyclist_injured","number_of_cyclist_killed"]:travelMode==="pedestrian"?["number_of_pedestrians_injured","number_of_pedestrians_killed"]:["number_of_motorist_injured","number_of_motorist_killed"];
    const query=`SELECT collision_id,crash_date,latitude,longitude,on_street_name,number_of_persons_injured,number_of_persons_killed WHERE crash_date >= '2024-01-01T00:00:00.000' AND crash_date < '2026-01-01T00:00:00.000' AND latitude BETWEEN ${south.toFixed(6)} AND ${north.toFixed(6)} AND longitude BETWEEN ${west.toFixed(6)} AND ${east.toFixed(6)} AND (${modeFields[0]} > 0 OR ${modeFields[1]} > 0) ORDER BY crash_date DESC,collision_id DESC LIMIT ${LIMIT+1}`;
    try {
      const crashResponse=await fetch(`${DATA}?${new URLSearchParams({"$query":query})}`,{signal:AbortSignal.any([AbortSignal.timeout(22000),...(signal?[signal]:[])])});
      if(!crashResponse.ok)throw new Error("dataset-unavailable");
      const records=await crashResponse.json() as RawCrash[];
      if(!Array.isArray(records))throw new Error("invalid-dataset");
      const unique=new Map<string,Crash>();
      for(const r of records.slice(0,LIMIT)){
        const coordinate:Coordinate=[Number(r.longitude),Number(r.latitude)];
        if(!r.collision_id||!r.crash_date||!isNYCCoordinate(coordinate))continue;
        unique.set(r.collision_id,{id:r.collision_id,date:r.crash_date.slice(0,10),coordinate,injured:Math.max(0,Number(r.number_of_persons_injured)||0),killed:Math.max(0,Number(r.number_of_persons_killed)||0),street:r.on_street_name?.trim()||"Location from police report"});
      }
      const crashes=Array.from(unique.values());
      routes.forEach(route=>route.crashes=nearbyCrashes(crashes,route.coordinates,RADIUS));
      value.crashes=Array.from(new Map(routes.flatMap(r=>r.crashes).map(c=>[c.id,c])).values());
      value.evidence={available:true,truncated:records.length>LIMIT,fetchedAt:new Date().toISOString(),recordsInArea:crashes.length,window:WINDOW,radiusMeters:RADIUS};
    }catch{value.evidence.error="Routes are available, but NYC collision records could not be loaded. Try again later."}
  if(value.evidence.available){
    try{
      const network=await fetchRoads(routes.map(route=>route.coordinates),signal);
      for(const route of routes){route.roadEvidence=matchRouteEvidence(route.crashes,route.steps?.length?route.steps:[{street:"",coordinates:route.coordinates}],network.roads);route.roadEvidence.truncated=network.truncated||value.evidence.truncated;if(route.roadEvidence.truncated)route.roadEvidence.error="Road or collision data reached its limit; matches are incomplete."}
    }catch{for(const route of routes)route.roadEvidence={available:false,truncated:false,matchedCrashes:[],ambiguousCount:0,unmatchedCount:0,routeCoverage:0,roadIds:[],error:"Road matching is unavailable. Nearby reports remain visible."}}
  }
  return value;
}
