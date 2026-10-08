import { isNYCCoordinate, type Place, type Coordinate } from "@/lib/veripath";
const cache=new Map<string,Place[]>();
export async function searchAddresses(query:string,signal?:AbortSignal):Promise<Place[]>{
 const text=query.trim();if(text.length<3||text.length>160)throw new Error("Enter an NYC address between 3 and 160 characters.");const key=text.toLowerCase();if(cache.has(key))return cache.get(key)!;
 const response=await fetch(`https://geosearch.planninglabs.nyc/v2/search?${new URLSearchParams({text,size:"5"})}`,{signal:AbortSignal.any([AbortSignal.timeout(12000),...(signal?[signal]:[])])});if(!response.ok)throw new Error("Address search is unavailable. Choose a landmark or map pin.");
 const data=await response.json() as {features?:{geometry?:{coordinates:Coordinate};properties?:{label?:string;borough?:string;id?:string}}[]};if(!Array.isArray(data.features))throw new Error("Address search returned an incomplete response.");const places=data.features.filter(f=>isNYCCoordinate(f.geometry?.coordinates)&&typeof f.properties?.label==="string").map((f,i)=>({id:`address-${f.properties?.id||`${key}-${i}`}`,name:f.properties!.label!,area:f.properties?.borough||"NYC address",coordinate:f.geometry!.coordinates}));if(cache.size>=30)cache.delete(cache.keys().next().value!);cache.set(key,places);return places;
}
