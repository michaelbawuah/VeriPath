"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Coordinate } from "@/lib/veripath";
import { reviewNodes, type ReviewCase } from "@/lib/review";
import "leaflet/dist/leaflet.css";
const latLng = (p: Coordinate): L.LatLngTuple => [p[1], p[0]];
export default function ReviewMap({ item, segment, node }: { item: ReviewCase; segment: string; node: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !item.coordinate || !item.roads.length) return;
    const map = L.map(container.current, { center: latLng(item.coordinate), zoom: 18, maxZoom: 20 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
    for (const road of item.roads) {
      const text = document.createElement("span"); text.textContent = `${road.street || "Unnamed road"} · Segment ${road.id} · Level ${road.levels || "unknown"}`;
      L.polyline(road.coordinates.map(latLng), { color: road.id === segment ? "#3548e8" : "#8993a8", weight: road.id === segment ? 7 : 3 }).bindPopup(text).addTo(map);
    }
    for (const point of reviewNodes(item)) {
      const text = document.createElement("span"); text.textContent = `Shared node ${point.id} · ${point.roads.length} nearby segments`;
      L.circleMarker(latLng(point.coordinate), { radius: point.id === node ? 9 : 4, color: "#8060b9", fillOpacity: .8 }).bindPopup(text).addTo(map);
    }
    const label = document.createElement("span"); label.textContent = "Reported collision coordinates";
    L.circleMarker(latLng(item.coordinate), { radius: 10, color: "#cc4b3c", weight: 3, fillOpacity: .08 }).bindPopup(label).addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); };
  }, [item, segment, node]);
  return <div className="review-map" ref={container} aria-label="Source coordinates and raw nearby road geometry">{(!item.coordinate || !item.roads.length) && <p>No local map context is available for this report. Review the source’s location text and record any uncertainty.</p>}</div>;
}
