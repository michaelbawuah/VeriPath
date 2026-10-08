"use client";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { PLACES, type Place } from "@/lib/veripath";
import { searchAddresses } from "@/lib/address-search";

export default function PlacePicker({label,value,onChange,onPick,active}:{label:string;value:Place;onChange:(value:Place)=>void;onPick:()=>void;active:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[results,setResults]=useState<Place[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[searched,setSearched]=useState(false);const request=useRef<AbortController|null>(null),version=useRef(0);
 useEffect(()=>()=>request.current?.abort(),[]);
 function close(value:boolean){setOpen(value);if(!value){request.current?.abort();version.current++;setBusy(false)}}
 function choose(place:Place){onChange(place);close(false);setQuery("");setResults([]);setError("");setSearched(false)}
 async function search(){request.current?.abort();const controller=new AbortController();request.current=controller;const current=++version.current;setBusy(true);setError("");setSearched(false);try{const places=await searchAddresses(query,controller.signal);if(version.current!==current)return;setResults(places);setSearched(true)}catch(error){if(controller.signal.aborted)return;setError(error instanceof Error?error.message:"Address lookup is unavailable.")}finally{if(version.current===current)setBusy(false)}}
 const presets=PLACES.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())).slice(0,query?8:4);
 return <div className="place-field"><div className="field-label"><label id={`label-${label}`}>{label}</label><button type="button" onClick={onPick} className={active?"pin-picker active":"pin-picker"} aria-pressed={active}><LocateFixed size={13}/>{active?"Cancel pin":"Choose on map"}</button></div>
 <Dialog open={open} onOpenChange={close}><DialogTrigger asChild><Button variant="outline" className="address-value" aria-label={`${label}: ${value.name}`}><MapPin size={16}/><span>{value.name}</span><Search size={15}/></Button></DialogTrigger><DialogContent className="address-dialog"><DialogHeader><DialogTitle>{label==="From"?"Where are you starting?":"Where are you going?"}</DialogTitle><DialogDescription>Find an NYC street address or choose a landmark.</DialogDescription></DialogHeader>
 <form className="address-form" onSubmit={event=>{event.preventDefault();void search()}}><label className="sr-only" htmlFor={`query-${label}`}>NYC address</label><Input id={`query-${label}`} value={query} onChange={event=>{version.current++;request.current?.abort();setBusy(false);setQuery(event.target.value);setResults([]);setSearched(false);setError("")}} placeholder="e.g. 120 Broadway, Manhattan" maxLength={160}/><Button type="submit" disabled={busy||query.trim().length<3}>{busy?<LoaderCircle className="spinner" size={16}/>:<Search size={16}/>}Search</Button></form>
 <div className="address-results" aria-live="polite">{error&&<p role="alert" className="error-state">{error}</p>}{searched&&!results.length&&<p>No matching NYC address. Try a street number and borough, or choose a map pin.</p>}{results.map(place=><button type="button" key={place.id} onClick={()=>choose(place)}><MapPin size={17}/><span>{place.name}<small>{place.area}</small></span></button>)}{presets.length>0&&<><p className="address-section-label">Landmarks</p>{presets.map(place=><button type="button" key={place.id} onClick={()=>choose(place)}><MapPin size={17}/><span>{place.name}<small>{place.area}</small></span></button>)}</>}</div><p className="address-source">Address results from NYC GeoSearch. Your submitted search is sent to that service.</p>
 </DialogContent></Dialog></div>;
}
