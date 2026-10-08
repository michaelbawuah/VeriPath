import type { RoadSegment, RouteStep } from "./road-matching";
import { pointToRouteMeters, type Coordinate } from "./veripath";
export type Junction={id:string;coordinate:Coordinate;roads:RoadSegment[]};
const SX=111320*0.7575649843840493,SY=110540;
export const junctionDistance=(a:Coordinate,b:Coordinate)=>Math.hypot((a[0]-b[0])*SX,(a[1]-b[1])*SY);
export class JunctionIndex {
 readonly nodes:Junction[]=[];
 private buckets=new Map<string,Junction[]>();
 constructor(roads:RoadSegment[],private normalize:(name:string)=>string){
  const endpoints=new Map<string,{road:RoadSegment;point:Coordinate}[]>();
  for(const road of roads)for(const [id,point] of [[road.from,road.coordinates[0]],[road.to,road.coordinates.at(-1)]] as const){if(!id||id==="0000000"||!point)continue;const list=endpoints.get(id)||[];list.push({road,point});endpoints.set(id,list)}
  for(const [id,list] of endpoints){if(list.some(item=>item.road.levels!=="MM"))continue;const coordinate:Coordinate=[list.reduce((sum,e)=>sum+e.point[0],0)/list.length,list.reduce((sum,e)=>sum+e.point[1],0)/list.length];if(list.some(e=>junctionDistance(e.point,coordinate)>3))continue;const unique=[...new Map(list.map(e=>[e.road.id,e.road])).values()];if(!unique.some(a=>unique.some(b=>this.distinct(a,b))))continue;const node={id,coordinate,roads:unique};this.nodes.push(node);const key=`${Math.floor(coordinate[0]*SX/100)},${Math.floor(coordinate[1]*SY/100)}`;const bucket=this.buckets.get(key)||[];bucket.push(node);this.buckets.set(key,bucket)}
 }
 names(road:RoadSegment){return [road.street,...(road.aliases||[])].map(this.normalize).filter(Boolean)}
 distinct(a:RoadSegment,b:RoadSegment){const first=this.names(a),second=this.names(b);return a.id!==b.id&&a.physical!==b.physical&&first.length>0&&second.length>0&&!first.some(name=>second.includes(name))}
 nearby(point:Coordinate,on:string,cross:string,requireNames=true){
  const x=Math.floor(point[0]*SX/100),y=Math.floor(point[1]*SY/100),first=this.normalize(on),second=this.normalize(cross);const found:{node:Junction;distance:number;margin:number}[]=[];
  for(let a=x-1;a<=x+1;a++)for(let b=y-1;b<=y+1;b++)for(const node of this.buckets.get(`${a},${b}`)||[]){const distance=junctionDistance(point,node.coordinate);if(distance>35)continue;const supported=!requireNames||(!!first&&!!second&&first!==second&&node.roads.some(r=>this.names(r).includes(first)&&node.roads.some(s=>this.distinct(r,s)&&this.names(s).includes(second))));if(supported)found.push({node,distance,margin:0})}
  found.sort((a,b)=>a.distance-b.distance||a.node.id.localeCompare(b.node.id));if(found.length)found[0].margin=found.length>1?found[1].distance-found[0].distance:999;return found;
 }
 alongRoute(steps:RouteStep[],samples:{point:Coordinate;roadId:string}[]){
  const start=steps[0]?.coordinates[0],end=steps.at(-1)?.coordinates.at(-1);
  return this.nodes.filter(node=>{
   if(!start||!end||junctionDistance(start,node.coordinate)<15||junctionDistance(end,node.coordinate)<15)return false;
   if(!steps.some(step=>node.roads.some(road=>this.names(road).includes(this.normalize(step.street)))&&pointToRouteMeters(node.coordinate,step.coordinates)<=12))return false;
   const incident=new Set(node.roads.map(road=>road.id));
   const near=samples.filter(sample=>incident.has(sample.roadId)&&junctionDistance(sample.point,node.coordinate)>5&&junctionDistance(sample.point,node.coordinate)<=45);
   // Strong samples on distinct connected branches establish an approach and
   // exit. Branch vectors must differ by at least 60 degrees; proximity alone
   // cannot attach reports to a parallel route or one ending before the node.
   return near.some(a=>near.some(b=>{
    if(a.roadId===b.roadId)return false;
    const ax=(a.point[0]-node.coordinate[0])*SX,ay=(a.point[1]-node.coordinate[1])*SY,bx=(b.point[0]-node.coordinate[0])*SX,by=(b.point[1]-node.coordinate[1])*SY;
    return (ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by))<=.5;
   }));
  }).map(node=>node.id);
 }
}
