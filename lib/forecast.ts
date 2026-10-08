import type { PlanResult, TravelMode } from "@/lib/veripath";
type Validation={forecast_year:number;modes:Record<string,{enabled:boolean;deviance_improvement_fraction:number}>};
let metadata:Validation|undefined;
const partitions=new Map<string,Record<string,number[]>>();
export async function enrichForecasts(result:PlanResult,mode:TravelMode,signal?:AbortSignal){
 try{
  if(!metadata){const response=await fetch("/model/validation.json",{signal});if(!response.ok)throw new Error("Forecast validation is unavailable.");metadata=await response.json() as Validation}
  const validation=metadata.modes[mode];
  if(!validation?.enabled){for(const route of result.routes)if(route.roadEvidence)route.roadEvidence.forecast={available:false,year:metadata.forecast_year,coverage:0,reason:"The model has not passed this travel mode’s held-out accuracy and calibration checks."};return}
  const prefixes=new Set(result.routes.flatMap(r=>r.roadEvidence?.roadIds.map(id=>id.slice(0,3))||[]));
  await Promise.all(Array.from(prefixes).map(async prefix=>{if(partitions.has(prefix))return;const response=await fetch(`/model/roads/${encodeURIComponent(prefix)}.json`,{signal});if(!response.ok)throw new Error("Forecast data is unavailable.");partitions.set(prefix,await response.json() as Record<string,number[]>)}));
  const index=mode==="auto"?0:mode==="bicycle"?1:2;
  for(const route of result.routes){const evidence=route.roadEvidence;if(!evidence)continue;const scores=evidence.roadIds.map(id=>partitions.get(id.slice(0,3))?.[id]?.[index]);const covered=scores.filter((s):s is number=>typeof s==="number"&&Number.isFinite(s)&&s>=0);const coveredMeters=evidence.roadIds.reduce((sum,id,i)=>sum+(typeof scores[i]==="number"&&Number.isFinite(scores[i])&&scores[i]!>=0?(evidence.roadMeters?.[id]||0):0),0);const coverage=evidence.totalMeters?coveredMeters/evidence.totalMeters:0;const available=evidence.available&&!evidence.truncated&&coverage>=.9&&scores.length>0;
   evidence.forecast={available,year:metadata.forecast_year,coverage,annualCount:available?covered.reduce((a,b)=>a+b,0):undefined,reason:available?undefined:"At least 90% complete road and model coverage is required.",validationImprovement:validation.deviance_improvement_fraction};
  }
 }catch{for(const route of result.routes)if(route.roadEvidence)route.roadEvidence.forecast={available:false,year:2026,coverage:0,reason:"Forecast data is unavailable. Historical evidence remains available."}}
}
