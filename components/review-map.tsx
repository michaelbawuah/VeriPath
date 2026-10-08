"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Coordinate } from "@/lib/veripath";
import { reviewNodes, type ReviewCase } from "@/lib/review";
import "leaflet/dist/leaflet.css";
const latLng = (p: Coordinate): L.LatLngTuple => [p[1], p[0]];
export default function ReviewMap({ item, segments, nodes }: { item: ReviewCase; segments: string[]; nodes: string[] }) {
  const container = useRef<HTMLDivElement>(null);
  const roads = useRef(new Map<string, L.Polyline>()), junctions = useRef(new Map<string, L.CircleMarker>());
  const [tileFailure, setTileFailure] = useState(false);
  useEffect(() => {
    if (!container.current || !item.coordinate || !item.roads.length) return;
    const map = L.map(container.current, { center: latLng(item.coordinate), zoom: 18, maxZoom: 20 });
    const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
    tiles.on("tileerror",()=>setTileFailure(true));tiles.on("load",()=>setTileFailure(false));
    for (const road of item.roads) {
      const text = document.createElement("span"); text.textContent = `${road.street || "Unnamed road"} · Segment ${road.id} · Level ${road.levels || "unknown"}`;
      roads.current.set(road.id,L.polyline(road.coordinates.map(latLng), { color: "#8993a8", weight: 3 }).bindPopup(text).addTo(map));
    }
    for (const point of reviewNodes(item)) {
      const text = document.createElement("span"); text.textContent = `Shared node ${point.id} · ${point.roads.length} nearby segments`;
      junctions.current.set(point.id,L.circleMarker(latLng(point.coordinate), { radius: 4, color: "#8060b9", fillOpacity: .8 }).bindPopup(text).addTo(map));
    }
    const label = document.createElement("span"); label.textContent = "Reported collision coordinates";
    L.circleMarker(latLng(item.coordinate), { radius: 10, color: "#cc4b3c", weight: 3, fillOpacity: .08 }).bindPopup(label).addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); roads.current.clear(); junctions.current.clear(); };
  }, [item]);
  useEffect(()=>{for(const [id,road] of roads.current)road.setStyle({color:segments.includes(id)?"#3548e8":"#8993a8",weight:segments.includes(id)?7:3});for(const [id,node] of junctions.current)node.setRadius(nodes.includes(id)?9:4)},[item,segments,nodes]);
  return <><div className="review-map" ref={container} aria-label="Source coordinates and raw nearby road geometry">{(!item.coordinate || !item.roads.length) && <p>No local map context is available for this report. Review the source’s location text and record any uncertainty.</p>}</div>{tileFailure&&<p className="quality-note" role="status">Basemap tiles could not load. Source roads and report coordinates remain visible.</p>}</>;
}
