import quarantine from "./road-quarantine.json";
import { JunctionIndex } from "./intersections";
import { distanceMeters, isNYCCoordinate, type Coordinate, type Crash } from "@/lib/veripath";
export type RoadSegment={id:string;physical:string;street:string;aliases?:string[];levels:string;coordinates:Coordinate[];from?:string;to?:string};
export type RoadMatch={roadId:string|null;status:"strong"|"intersection"|"ambiguous"|"unmatched";distanceMeters:number|null;marginMeters:number|null;streetAgrees:boolean;nodeId?:string;nodeCoordinate?:Coordinate;reason?:string};
export type RouteStep={street:string;coordinates:Coordinate[]};
export type RoadEvidence={available:boolean;truncated:boolean;matchedCrashes:Crash[];intersectionCrashes?:Crash[];ambiguousCount:number;unmatchedCount:number;offRouteCount?:number;routeCoverage:number;roadIds:string[];roadMeters?:Record<string,number>;totalMeters?:number;error?:string;forecast?:{available:boolean;annualCount?:number;year:number;coverage:number;reason?:string;validationImprovement?:number}};
export const ROAD_SOURCE="https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/LION/FeatureServer/0/query";
export function normalizeStreet(street:string){
 const aliases:Record<string,string>={STREET:"ST",AVENUE:"AVE",BOULEVARD:"BLVD",ROAD:"RD",DRIVE:"DR",PLACE:"PL",COURT:"CT",PARKWAY:"PKWY",NORTH:"N",SOUTH:"S",EAST:"E",WEST:"W",TERRACE:"TER"};
 return street.toUpperCase().replace(/[^A-Z0-9]/g," ").split(/\s+/).filter(Boolean).map(word=>{word=word.replace(/^(\d+)(ST|ND|RD|TH)$/,"$1");return aliases[word]||word}).join(" ");
}

function roadDistance(point:Coordinate,line:Coordinate[]){
 const sx=111320*0.7575649843840493,sy=110540;let minimum=Infinity;
 for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];const ax=(a[0]-point[0])*sx,ay=(a[1]-point[1])*sy,dx=(b[0]-a[0])*sx,dy=(b[1]-a[1])*sy;const t=dx*dx+dy*dy?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))):0;minimum=Math.min(minimum,Math.hypot(ax+t*dx,ay+t*dy))}return minimum;
}

export class RoadIndex{
 private buckets=new Map<string,RoadSegment[]>();
 readonly junctions:JunctionIndex;
 constructor(roads:RoadSegment[]){this.junctions=new JunctionIndex(roads.map(road=>quarantine.includes(road.id)?{...road,levels:"QQ"}:road),normalizeStreet);for(const road of roads){const cells=new Set<string>();for(let i=1;i<road.coordinates.length;i++){const a=road.coordinates[i-1],b=road.coordinates[i];const sx=111320*0.7575649843840493,sy=110540;for(let x=Math.floor(Math.min(a[0],b[0])*sx/100);x<=Math.floor(Math.max(a[0],b[0])*sx/100);x++)for(let y=Math.floor(Math.min(a[1],b[1])*sy/100);y<=Math.floor(Math.max(a[1],b[1])*sy/100);y++)cells.add(`${x},${y}`)}for(const key of cells){const bucket=this.buckets.get(key)||[];bucket.push(road);this.buckets.set(key,bucket)}}}
 locate(point:Coordinate,street:string,crossStreet=""):RoadMatch{
  const context=this.junctions.nearby(point,street,crossStreet),first=context[0];
  if(first&&first.distance<=15&&first.margin>=10){let gradeConflict=false;const gx=Math.floor(point[0]*111320*0.7575649843840493/100),gy=Math.floor(point[1]*110540/100);for(let x=gx-1;x<=gx+1;x++)for(let y=gy-1;y<=gy+1;y++)for(const road of this.buckets.get(`${x},${y}`)||[])if((road.levels!=="MM"||quarantine.includes(road.id))&&roadDistance(point,road.coordinates)<=first.distance+6)gradeConflict=true;if(!gradeConflict)return {roadId:null,status:"intersection",nodeId:first.node.id,nodeCoordinate:first.node.coordinate,distanceMeters:first.distance,marginMeters:first.margin,streetAgrees:true,reason:"Coordinates and both reported street names support a shared ground-level node."}}
  const match=this.match(point,street),near=this.junctions.nearby(point,street,crossStreet,false)[0];if(near&&near.distance<=15&&match.status==="strong")return {...match,status:"ambiguous",reason:"A nearby junction does not have enough evidence for a unique association."};return match;
 }
 match(point:Coordinate,street:string):RoadMatch{
  const gx=Math.floor(point[0]*111320*0.7575649843840493/100),gy=Math.floor(point[1]*110540/100),name=normalizeStreet(street);const seen=new Set<string>();let candidates:{road:RoadSegment;distance:number;named:boolean}[]=[];
  for(let x=gx-1;x<=gx+1;x++)for(let y=gy-1;y<=gy+1;y++)for(const road of this.buckets.get(`${x},${y}`)||[]){if(seen.has(road.id))continue;seen.add(road.id);const distance=roadDistance(point,road.coordinates);if(distance<=35)candidates.push({road,distance,named:!!name&&[road.street,...(road.aliases||[])].some(alias=>normalizeStreet(alias)===name)})}
  if(!candidates.length)return {roadId:null,status:"unmatched",distanceMeters:null,marginMeters:null,streetAgrees:false};
  const allCandidates=candidates;if(candidates.some(c=>c.named))candidates=candidates.filter(c=>c.named);candidates.sort((a,b)=>a.distance-b.distance||a.road.id.localeCompare(b.road.id));
  const first=candidates[0],second=candidates.find(c=>c.road.id!==first.road.id),margin=second?second.distance-first.distance:999;
  const gradeConflict=allCandidates.some(c=>c.road.id!==first.road.id&&(c.road.levels!=="MM"||quarantine.includes(c.road.id))&&c.distance<=first.distance+6);
  const strong=!quarantine.includes(first.road.id)&&!gradeConflict&&first.road.levels==="MM"&&first.distance<=20&&margin>=6&&(first.named||margin>=12);
  return {roadId:first.road.id,status:strong?"strong":"ambiguous",distanceMeters:first.distance,marginMeters:margin,streetAgrees:first.named};
 }
}
// Midpoint samples every ~15m avoid overweighting original polyline vertex density.
export function sampleSteps(steps:RouteStep[]){const samples:{point:Coordinate;street:string;meters:number}[]=[];for(const step of steps)for(let i=1;i<step.coordinates.length;i++){const a=step.coordinates[i-1],b=step.coordinates[i],meters=distanceMeters(a,b);if(meters<0.01)continue;const n=Math.ceil(meters/15);for(let j=0;j<n;j++){const t=(j+.5)/n;samples.push({point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],street:step.street,meters:meters/n})}}return samples}
export function matchRouteEvidence(crashes:Crash[],steps:RouteStep[],roads:RoadSegment[]):RoadEvidence{
 const index=new RoadIndex(roads),ids=new Set<string>(),roadMeters:Record<string,number>={},traversed:{point:Coordinate;roadId:string}[]=[];let total=0,matched=0;for(const sample of sampleSteps(steps)){total+=sample.meters;const match=index.match(sample.point,sample.street);if(match.status==="strong"&&match.roadId){ids.add(match.roadId);traversed.push({point:sample.point,roadId:match.roadId});matched+=sample.meters;roadMeters[match.roadId]=(roadMeters[match.roadId]||0)+sample.meters}}
 const routeNodes=new Set(index.junctions.alongRoute(steps,traversed)),matchedCrashes:Crash[]=[],intersectionCrashes:Crash[]=[];let ambiguousCount=0,unmatchedCount=0,offRouteCount=0;for(const crash of new Map(crashes.map(crash=>[crash.id,crash])).values()){const match=index.locate(crash.coordinate,crash.street,crash.crossStreet);if(match.status==="strong"&&match.roadId&&ids.has(match.roadId))matchedCrashes.push({...crash,roadMatch:match});else if(match.status==="intersection"&&match.nodeId&&routeNodes.has(match.nodeId))intersectionCrashes.push({...crash,roadMatch:match});else if(match.status==="ambiguous")ambiguousCount++;else if(match.status==="unmatched")unmatchedCount++;else offRouteCount++}
 return {available:true,truncated:false,matchedCrashes,intersectionCrashes,ambiguousCount,unmatchedCount,offRouteCount,routeCoverage:total?matched/total:0,roadIds:Array.from(ids),roadMeters,totalMeters:total};
}
export async function fetchRoads(paths:Coordinate[][],signal?:AbortSignal):Promise<{roads:RoadSegment[];truncated:boolean}>{
 if(!Array.isArray(paths)||!paths.length||paths.some(path=>!Array.isArray(path)||path.length<2||!path.every(isNYCCoordinate)))throw new Error("A valid NYC route is required for road matching.");
 const geometry=JSON.stringify({paths,spatialReference:{wkid:4326}});const unique=new Map<string,RoadSegment>();let truncated=false;
 for(let offset=0;offset<6000;offset+=2000){const params=new URLSearchParams({f:"geojson",outSR:"4326",inSR:"4326",geometry,geometryType:"esriGeometryPolyline",distance:"100",units:"esriSRUnit_Meter",spatialRel:"esriSpatialRelIntersects",where:"FeatureTyp IN ('0','6','A','C','W') AND RB_Layer IN ('B','R')",outFields:"SegmentID,PhysicalID,Street,NodeIDFrom,NodeIDTo,NodeLevelF,NodeLevelT",orderByFields:"OBJECTID",resultOffset:String(offset),resultRecordCount:"2000",geometryPrecision:"6",maxAllowableOffset:"0.00001"});
  const response=await fetch(ROAD_SOURCE,{method:"POST",body:params,signal:AbortSignal.any([AbortSignal.timeout(25000),...(signal?[signal]:[])])});if(!response.ok)throw new Error("Official road geometry is unavailable.");const data=await response.json() as {features?:{properties:Record<string,unknown>;geometry:{type:string;coordinates:unknown}}[];properties?:{exceededTransferLimit?:boolean};error?:unknown;exceededTransferLimit?:boolean};if(!Array.isArray(data.features)||data.error)throw new Error("Official road geometry is unavailable.");
  for(const feature of data.features){const p=feature.properties;if(!p.SegmentID||!feature.geometry)continue;const candidates=feature.geometry.type==="LineString"?[feature.geometry.coordinates]:feature.geometry.type==="MultiLineString"?feature.geometry.coordinates as unknown[]:[];const line=candidates.filter(Array.isArray).sort((a,b)=>b.length-a.length)[0] as Coordinate[]|undefined;if(!line||line.length<2||!line.every(c=>Array.isArray(c)&&c.length>=2&&c.every(Number.isFinite)))continue;const id=String(p.SegmentID).trim();const existing=unique.get(id);if(existing){existing.aliases=[...new Set([...(existing.aliases||[]),String(p.Street||"").trim()])];}else unique.set(id,{id,physical:String(p.PhysicalID||id).trim(),street:String(p.Street||"").trim(),levels:String(p.NodeLevelF||"").trim()+String(p.NodeLevelT||"").trim(),coordinates:line,from:feature.geometry.type==="LineString"?String(p.NodeIDFrom||"").trim():undefined,to:feature.geometry.type==="LineString"?String(p.NodeIDTo||"").trim():undefined})}
  if(data.features.length<2000&&!data.exceededTransferLimit&&!data.properties?.exceededTransferLimit)break;if(offset===4000)truncated=true;
 }
 return {roads:Array.from(unique.values()),truncated};
}
