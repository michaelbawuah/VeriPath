import type { Coordinate } from "@/lib/veripath";
import type { RoadSegment } from "@/lib/road-matching";

export interface ReviewCase {
  id: string; date: string; borough: string; coordinate: Coordinate | null;
  onStreet: string; nearestCrossStreet: string; locationText: string; modes: string[];
  roads: RoadSegment[];
}
export interface ReviewLabel {
  associationType: "segment" | "intersection" | "ambiguous" | "insufficient_location" | "outside_scope";
  acceptableSegmentIds: string[]; acceptableNodeIds: string[];
  rationale: string; reviewedAt: string;
}
export interface ReviewNode { id: string; coordinate: Coordinate; roads: string[] }
// Raw shared endpoints, including elevated and unknown levels. This view never
// applies the matcher's eligibility rules or exposes its predicted association.
export function reviewNodes(item: ReviewCase): ReviewNode[] {
  const groups = new Map<string, { coordinate: Coordinate; road: string }[]>();
  for (const road of item.roads) for (const [id, coordinate] of [[road.from, road.coordinates[0]], [road.to, road.coordinates.at(-1)]] as const) {
    if (!id || /^0+$/.test(id) || !coordinate) continue;
    const endpoints = groups.get(id) || []; endpoints.push({ coordinate, road: road.id }); groups.set(id, endpoints);
  }
  return [...groups].filter(([, endpoints]) => new Set(endpoints.map(e => e.road)).size > 1).map(([id, endpoints]) => ({
    id, coordinate: [endpoints.reduce((n, e) => n + e.coordinate[0], 0) / endpoints.length, endpoints.reduce((n, e) => n + e.coordinate[1], 0) / endpoints.length],
    roads: [...new Set(endpoints.map(e => e.road))],
  }));
}
