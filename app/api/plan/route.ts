import { distanceMeters, isNYCCoordinate, type PlanResult, type TravelMode } from "@/lib/veripath";
import { fetchTrip } from "@/lib/plan-trip";
const cache=new Map<string,{expires:number;value:PlanResult}>();
let nextRouteRequest=0;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});

export async function POST(request:Request) {
  let input:unknown;
  try {if(Number(request.headers.get("Content-Length")||0)>4096)return json({error:"Trip request is too large."},413);const body=await request.text();if(body.length>4096)return json({error:"Trip request is too large."},413);input=JSON.parse(body)}catch{return json({error:"Enter a valid trip."},400)}
  if(!input||typeof input!=="object")return json({error:"Enter a valid trip."},400);
  const {origin,destination,mode} = input as {origin:unknown;destination:unknown;mode:unknown};
  if(!isNYCCoordinate(origin)||!isNYCCoordinate(destination)||(typeof mode!=="string"||!["auto","bicycle","pedestrian"].includes(mode)))return json({error:"Choose two locations in the NYC pilot area and a supported travel mode."},400);
  const direct=distanceMeters(origin,destination);
  if(direct<35)return json({error:"Choose a destination farther from your starting point."},400);
  if(direct>15000)return json({error:"The first pilot supports trips up to 15 km apart. Choose a closer destination."},400);
  const travelMode=mode as TravelMode;
  const key=JSON.stringify([origin,destination,mode]);
  const cached=cache.get(key);if(cached&&cached.expires>Date.now())return json(cached.value);
  if(Date.now()<nextRouteRequest)return json({error:"Please wait a moment before planning another route."},429);
  nextRouteRequest=Date.now()+1100;
  try {
    const value=await fetchTrip(origin,destination,travelMode,request.signal);
    if(cache.size>=12)cache.delete(cache.keys().next().value!);
    // Cache successful evidence only, so a provider outage can be retried.
    if(value.evidence.available)cache.set(key,{expires:Date.now()+5*60*1000,value});
    return json(value);
  }catch{return json({error:"The routing service is temporarily unavailable. Please try again in a moment."},503)}
}
