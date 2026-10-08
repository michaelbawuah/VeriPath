"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import L from "leaflet";
import type { PlanResult, Place, Coordinate } from "@/lib/veripath";
import "leaflet/dist/leaflet.css";
const latLng=(p:Coordinate):L.LatLngTuple=>[p[1],p[0]];

export default function RouteMap({result,selected,origin,destination,showCrashes,onSelect,onPick,pickTarget}:{result:PlanResult|null;selected:string|null;origin:Place;destination:Place;showCrashes:boolean;onSelect:(id:string)=>void;onPick:(coordinate:Coordinate)=>void;pickTarget:"origin"|"destination"|null}) {
  const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layers=useRef<L.LayerGroup|null>(null);
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  const handlers=useRef({onSelect,onPick,pickTarget});useLayoutEffect(()=>{handlers.current={onSelect,onPick,pickTarget}});
  useEffect(()=>{
    if(!container.current)return;
    const instance=L.map(container.current,{center:[40.746,-73.988],zoom:13,minZoom:9,maxZoom:18,zoomControl:false,maxBounds:[[40.45,-74.30],[40.97,-73.65]]});
    map.current=instance;L.control.zoom({position:"topright"}).addTo(instance);
    const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(instance);
    tiles.on("tileerror",()=>setFailed(true));tiles.on("load",()=>setFailed(false));
    layers.current=L.layerGroup().addTo(instance);setReady(true);
    instance.on("click",event=>{if(handlers.current.pickTarget)handlers.current.onPick([event.latlng.lng,event.latlng.lat])});
    const resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(container.current);
    return ()=>{resize.disconnect();instance.remove();map.current=null;layers.current=null};
  },[]);
  useEffect(()=>{
    const group=layers.current;if(!group||!ready)return;group.clearLayers();
    const routes=result?.routes||[];
    for(const route of [...routes.filter(r=>r.id!==selected),...routes.filter(r=>r.id===selected)]){
      const points=route.coordinates.map(latLng),isSelected=route.id===selected;
      L.polyline(points,{color:"white",weight:isSelected?10:7,opacity:0.95,interactive:false}).addTo(group);
      L.polyline(points,{color:isSelected?"#3548e8":"#8491d0",weight:isSelected?6:3.5,bubblingMouseEvents:false}).on("click",event=>{if(handlers.current.pickTarget)handlers.current.onPick([event.latlng.lng,event.latlng.lat]);else handlers.current.onSelect(route.id)}).addTo(group);
    }
    const chosen=routes.find(r=>r.id===selected);
    if(showCrashes)for(const crash of chosen?.crashes||[]){
      const element=document.createElement("div");element.className="crash-popup";
      const title=document.createElement("b");title.textContent=crash.street;
      const date=document.createElement("p");date.textContent=`Reported ${crash.date}`;
      const detail=document.createElement("p");detail.textContent=`${crash.injured} injured · ${crash.killed} killed in this incident`;
      element.appendChild(title);element.appendChild(date);element.appendChild(detail);
      L.circleMarker(latLng(crash.coordinate),{radius:4,color:"white",weight:1.4,fillColor:crash.killed>0?"#c13c39":"#dca13b",fillOpacity:0.95,bubblingMouseEvents:false}).bindPopup(element).addTo(group);
    }
    for(const [place,color] of [[origin,"#3548e8"],[destination,"#19243e"]] as const)L.circleMarker(latLng(place.coordinate),{radius:8,color:"white",weight:3,fillColor:color,fillOpacity:1,interactive:false}).addTo(group);
  },[result,selected,ready,showCrashes,origin,destination]);
  useEffect(()=>{
    const instance=map.current;if(!instance||!ready)return;
    const points=result?.routes.flatMap(r=>r.coordinates)||[origin.coordinate,destination.coordinate];
    instance.fitBounds(L.latLngBounds(points.map(latLng)),{paddingTopLeft:[40,90],paddingBottomRight:[60,120],maxZoom:15,animate:!window.matchMedia("(prefers-reduced-motion: reduce)").matches});
  },[result,ready,origin,destination]);
  return <><div ref={container} className={`live-map ${pickTarget?"picking":""}`} aria-label="Interactive OpenStreetMap of NYC routes"/>{failed&&<div className="map-error" role="status">Map tiles could not load. Routes and collision markers remain available.</div>}</>;
}
