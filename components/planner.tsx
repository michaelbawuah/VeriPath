"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { flushSync } from "react-dom";
import { Bike, CarFront, Footprints, Route, MapPin, ArrowDownUp, Clock3, ShieldCheck, Layers, Globe2, Info, Navigation, LoaderCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import PlacePicker from "@/components/place-picker";
import { enrichForecasts } from "@/lib/forecast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { PLACES, filterDetour, distanceMeters, isNYCCoordinate, type Place, type TravelMode, type PlanResult, type Coordinate } from "@/lib/veripath";
import { fetchTrip } from "@/lib/plan-trip";
import { registerPlannerTools, type PlannerContext } from "@/lib/webmcp";

const RouteMap = dynamic(()=>import("@/components/route-map"),{ssr:false});
const SOURCE="https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95";

function CoverageDialog(){return <Dialog><DialogTrigger asChild><Button variant="ghost" className="coverage-button"><Globe2 size={17}/>Coverage</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>One city at a time.</DialogTitle><DialogDescription>New York first. More US cities next, followed by locally validated pilots in Ghana and Nigeria.</DialogDescription></DialogHeader><div className="coverage-list"><div><b>New York City</b><span>Route explorer · available</span></div><div><b>Additional US cities</b><span>Next · local data review required</span></div><div><b>Accra, Ghana</b><span>Future pilot · local data and validation</span></div><div><b>Nigeria’s major cities</b><span>Future pilots · local partnerships</span></div></div></DialogContent></Dialog>}

export default function Planner() {
  const [origin,setOrigin]=useState(PLACES[0]),[destination,setDestination]=useState(PLACES[1]);
  const [mode,setMode]=useState<TravelMode>("bicycle"),[result,setResult]=useState<PlanResult|null>(null);
  const [selected,setSelected]=useState<string|null>(null),[detour,setDetour]=useState("10");
  const [showCrashes,setShowCrashes]=useState(true),[pickTarget,setPickTarget]=useState<"origin"|"destination"|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const requestRef=useRef<AbortController|null>(null),generation=useRef(0);

  function invalidate(){generation.current++;requestRef.current?.abort();setBusy(false);setError("");setResult(null);setSelected(null)}
  function changeLocation(target:"origin"|"destination",place:Place){invalidate();if(target==="origin")setOrigin(place);else setDestination(place);setPickTarget(null)}
  function changeMode(value:TravelMode){invalidate();setMode(value)}
  function pick(coordinate:Coordinate){
    if(!pickTarget)return;
    if(!isNYCCoordinate(coordinate)){setError("Choose a pin inside the NYC pilot area.");return}
    changeLocation(pickTarget,{id:`pin-${pickTarget}`,name:`Map pin · ${coordinate[1].toFixed(4)}, ${coordinate[0].toFixed(4)}`,area:"NYC pilot area",coordinate});
  }

  async function plan() {
    requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;
    const current=++generation.current;setBusy(true);setError("");setPickTarget(null);
    try {
      const response=await fetch("/api/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({origin:origin.coordinate,destination:destination.coordinate,mode}),signal:controller.signal});
      let data=await response.json() as PlanResult & {error?:string};
      if(response.status===503) data=await fetchTrip(origin.coordinate,destination.coordinate,mode,controller.signal);
      if(!response.ok&&response.status!==503)throw new Error(data.error||"Unable to plan this trip. Please try again.");
      if(!Array.isArray(data.routes)||!data.routes.length||!data.evidence)throw new Error("An incomplete trip response was returned. Please try again.");
      await enrichForecasts(data,mode,controller.signal);
      if(generation.current!==current)return {cancelled:true};
      flushSync(()=>{setResult(data);setSelected(data.routes[0]?.id||null)});
      return {routeCount:data.routes.length,evidenceAvailable:data.evidence.available};
    }catch(e){if(controller.signal.aborted)return {cancelled:true};const message=e instanceof Error?e.message:"Unable to plan this trip.";setError(message);return {error:message}}
    finally{if(generation.current===current)setBusy(false)}
  }
  const actions=useRef({plan,select:(id:string)=>setSelected(id),read:()=>({origin:origin.name,destination:destination.name,mode,selectedRoute:selected,routeCount:result?.routes.length||0})});
  useLayoutEffect(()=>{actions.current={plan,select:(id)=>{if(!result?.routes.some(r=>r.id===id))throw new Error("Unknown route");flushSync(()=>setSelected(id))},read:()=>({origin:origin.name,destination:destination.name,mode,selectedRoute:selected,routeCount:result?.routes.length||0})}});
  useEffect(()=>{const context=(document as Document & {modelContext?:PlannerContext}).modelContext;return registerPlannerTools(context,actions)},[]);
  useEffect(()=>()=>requestRef.current?.abort(),[]);

  const visibleRoutes=filterDetour(result?.routes||[],detour==="any"?null:Number(detour));
  const chosen=result?.routes.find(r=>r.id===selected);
  const involving=mode==="bicycle"?"cyclists":mode==="pedestrian"?"pedestrians":"motorists";
  return <main className="veripath-app">
    <header className="topbar"><Link className="brand" href="/" aria-label="VeriPath home"><span className="brand-symbol"><Route size={23}/></span>VeriPath<span className="brand-period">.</span></Link><div className="topbar-center"><MapPin size={15}/>New York City<span className="pilot-tag">Early access</span></div><CoverageDialog/></header>
    <div className="workspace"><aside className="planner-panel"><div className="eyebrow"><span className="line-mark"/>PLAN A TRIP</div><h1>Your route.<br/><span>More context.</span></h1><p className="intro">Explore NYC routes with the collision history around them.</p>
      <Tabs value={mode} onValueChange={(v)=>changeMode(v as TravelMode)}><TabsList className="mode-tabs"><TabsTrigger value="bicycle"><Bike/>Cycle</TabsTrigger><TabsTrigger value="auto"><CarFront/>Drive</TabsTrigger><TabsTrigger value="pedestrian"><Footprints/>Walk</TabsTrigger></TabsList></Tabs>
      <div className="journey-fields"><PlacePicker label="From" value={origin} onChange={p=>changeLocation("origin",p)} onPick={()=>setPickTarget(pickTarget==="origin"?null:"origin")} active={pickTarget==="origin"}/><Button className="swap-button" variant="outline" size="icon" aria-label="Swap origin and destination" onClick={()=>{invalidate();setOrigin(destination);setDestination(origin)}}><ArrowDownUp size={17}/></Button><PlacePicker label="To" value={destination} onChange={p=>changeLocation("destination",p)} onPick={()=>setPickTarget(pickTarget==="destination"?null:"destination")} active={pickTarget==="destination"}/></div>
      <div className="detour-field"><label id="detour-label">Maximum extra time</label><Select value={detour} onValueChange={v=>{setDetour(v);const eligible=filterDetour(result?.routes||[],v==="any"?null:Number(v));if(!eligible.some(r=>r.id===selected))setSelected(eligible[0]?.id||null)}}><SelectTrigger aria-labelledby="detour-label"><SelectValue/></SelectTrigger><SelectContent>{["0","5","10","20","any"].map(v=><SelectItem key={v} value={v}>{v==="any"?"Any detour":v==="0"?"Fastest only":`${v} minutes`}</SelectItem>)}</SelectContent></Select></div>
      <Button className="plan-button" onClick={()=>void plan()} disabled={busy||distanceMeters(origin.coordinate,destination.coordinate)<35}>{busy?<LoaderCircle className="spinner"/>:<Route size={18}/>} {busy?"Finding your routes…":"Compare routes"}</Button><p className="field-hint">Search addresses, choose landmarks or place map pins. NYC trips up to 15 km apart.</p>
      {error&&<div className="error-state" role="alert">{error}</div>}
      <section className="results" aria-live="polite" aria-busy={busy}>{result?<><div className="results-title"><h2>Your options</h2><span>{visibleRoutes.length} {visibleRoutes.length===1?"route":"routes"}</span></div>{visibleRoutes.map(route=><button type="button" key={route.id} onClick={()=>setSelected(route.id)} aria-pressed={route.id===selected} className={`route-card ${route.id===selected?"selected":""}`}><span className="route-card-top"><span>{route.id===result.routes[0].id?"Fastest available":"Alternative"}</span><Clock3 size={16}/></span><span className="route-numbers"><b>{Math.max(1,Math.round(route.seconds/60))}<span> min</span></b><span>{(route.meters/1000).toFixed(1)} km</span><span>{route.seconds>result.routes[0].seconds?`+${Math.round((route.seconds-result.routes[0].seconds)/60)} min`:""}</span></span><span className="route-count">{result.evidence.available?`${result.evidence.truncated?"At least ":""}${route.crashes.length.toLocaleString()} nearby injury/fatal reports`:"Collision evidence unavailable"}</span>{route.roadEvidence?.available&&<span className="road-match-line">{route.roadEvidence.matchedCrashes.length} matched to route streets · {Math.round(route.roadEvidence.routeCoverage*100)}% road coverage{route.roadEvidence.truncated?" · incomplete":""}</span>}{route.roadEvidence?.error&&<span className="road-match-line">{route.roadEvidence.error}</span>}{route.roadEvidence?.forecast?.available&&<span className="forecast-line">{route.roadEvidence.forecast.year} annual forecast: {route.roadEvidence.forecast.annualCount?.toFixed(1)} reports</span>}</button>)}{result.routes.length===1&&<p className="result-note">One route returned for this trip. Try another destination to explore different options.</p>}<p className="result-note">Estimated times exclude live traffic. Counts describe nearby police-reported crashes where {involving} were injured or killed in 2024–2025.</p>{result.evidence.error&&<p className="error-state" role="status">{result.evidence.error}</p>}
      <Dialog><DialogTrigger asChild><Button variant="outline" className="evidence-button"><BookOpen size={16}/>How to read the evidence</Button></DialogTrigger><DialogContent className="evidence-dialog"><DialogHeader><DialogTitle>Context, with its limits.</DialogTitle><DialogDescription>Historical collision records help you understand a route. They do not establish how safe your next trip will be.</DialogDescription></DialogHeader><div className="evidence-copy"><p><b>What we count</b><br/>Distinct police-reported injury or fatal crashes where {involving} were injured or killed, dated January 1, 2024 through December 31, 2025, within approximately {result.evidence.radiusMeters} meters of the route line.</p><p><b>What may be missing</b><br/>Unreported incidents and records without usable coordinates. Nearby incidents may be on a parallel street, a different road level, or across an intersection. Street matches use official LION roadbed geometry, street-name agreement and distance margins. Ambiguous intersections, non-ground roads and missing levels are withheld from matched counts.</p><p><b>Road matching</b><br/>{chosen?.roadEvidence?.available?`${chosen.roadEvidence.matchedCrashes.length} nearby reports have a strong rule-based match to the route streets. ${chosen.roadEvidence.ambiguousCount} have ambiguous road assignments. ${Math.round(chosen.roadEvidence.routeCoverage*100)}% of the route geometry matched. These rules are not calibrated probabilities.`:"Official road matching is unavailable for this trip."}</p><p><b>Annual forecast</b><br/>{chosen?.roadEvidence?.forecast?.available?`The 2026 model forecasts ${chosen.roadEvidence.forecast.annualCount?.toFixed(1)} police-reported injury crashes across the matched full road segments during the whole year, using records through 2025. This is not the risk of your trip. Ambiguous reports are excluded. Model comparisons require at least 90% route and forecast coverage.`:chosen?.roadEvidence?.forecast?.reason||"A validated forecast is unavailable for this trip."} <a href="/model/validation.json" target="_blank" rel="noopener noreferrer">Read the held-out evaluation</a></p><p><b>How to compare</b><br/>Longer and busier roads can have more records. Counts are not adjusted for traffic volume and should not be read as crash probabilities or a “safer” ranking.</p><p><b>Data status</b><br/>{result.evidence.available?`Retrieved ${new Date(result.evidence.fetchedAt).toLocaleString()}. ${result.evidence.recordsInArea.toLocaleString()} mapped records in the queried area.`:"Collision data could not be retrieved."}{result.evidence.truncated?" Results reached the record limit and are incomplete.":""}</p><a href={SOURCE} target="_blank" rel="noopener noreferrer">View NYC Open Data source</a><p className="privacy-note">Route coordinates are sent to a third-party routing service, which may log requests. Road and crash queries share route geometry and the surrounding area with NYC Planning and NYC Open Data, and map tiles reveal the viewed area to OpenStreetMap. VeriPath does not require your name or store a trip history.</p></div></DialogContent></Dialog>
      </>:<div className="empty-result"><span className="empty-icon"><Navigation size={23}/></span><h2>A little more information<br/>for the road ahead.</h2><p>Compare travel time and historical collision context in one place.</p></div>}</section><div className="panel-footer"><ShieldCheck size={17}/><span>Evidence first. Clear about uncertainty.</span></div>
    </aside><section className="map-panel" aria-label="NYC map"><RouteMap result={result} selected={selected} origin={origin} destination={destination} showCrashes={showCrashes} onSelect={setSelected} onPick={pick} pickTarget={pickTarget}/><div className="map-topline"><span className="map-city"><MapPin size={15}/>NYC</span><span className="map-status"><Info size={14}/>Historical evidence preview</span></div><div className="map-controls"><label htmlFor="collision-layer">Collision records</label><Switch id="collision-layer" checked={showCrashes} onCheckedChange={setShowCrashes}/></div>{pickTarget&&<div className="pick-banner" role="status">Click the map to choose your {pickTarget=== "origin"?"starting point":"destination"}.</div>}<div className="map-bottom-card"><div className="map-bottom-icon"><Layers size={21}/></div><div><b>{chosen?(result?.evidence.available?`${result.evidence.truncated?"At least ":""}${chosen.crashes.length.toLocaleString()} nearby records · ${involving}`:"Collision evidence unavailable"):"Understand the route you choose."}</b><p>{chosen?(result?.evidence.available?"Amber: injury crash · Red: fatal crash · Click a marker for the report":"The route is available. Collision records could not be retrieved."):"Compare real routes, then explore the historical collision context."}</p></div></div><a className="fix-map" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Improve this map</a></section></div>
  </main>;
}
