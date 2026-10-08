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
export interface ReviewExport { schemaVersion: 1; reviewerId: string; hashes: Record<string, string>; labels: Record<string, ReviewLabel> }
export interface ReviewDraft { associationType: ReviewLabel["associationType"] | ""; acceptableSegmentIds: string[]; acceptableNodeIds: string[]; rationale: string }
export const blankReview = (): ReviewDraft => ({ associationType: "", acceptableSegmentIds: [], acceptableNodeIds: [], rationale: "" });
export function reviewIdentity(value: ReviewDraft) { return JSON.stringify([value.associationType, [...new Set(value.acceptableSegmentIds)].sort(), [...new Set(value.acceptableNodeIds)].sort(), value.rationale]); }
export function hasReviewChanges(draft: ReviewDraft | undefined, saved: ReviewLabel | undefined) { return !!draft && reviewIdentity(draft) !== reviewIdentity(saved || blankReview()); }
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const types = new Set(["segment", "intersection", "ambiguous", "insufficient_location", "outside_scope"]);
export function parseReviewExport(value: unknown, cases: ReviewCase[], hashes: Record<string, string>, reviewer = ""): ReviewExport {
  if (!isObject(value) || value.schemaVersion !== 1 || !isObject(value.hashes)) throw new Error("Choose a VeriPath review export.");
  const keys = Object.keys(hashes);
  if (Object.keys(value.hashes).length !== keys.length || keys.some(key => value.hashes && (value.hashes as Record<string, unknown>)[key] !== hashes[key])) throw new Error("This export belongs to a different frozen audit. Use its original review packet.");
  if (typeof value.reviewerId !== "string" || !value.reviewerId.trim() || value.reviewerId.trim().length > 80) throw new Error("The export needs a valid reviewer code.");
  const reviewerId = value.reviewerId.trim();
  if (reviewer && reviewer.trim().toLowerCase() !== reviewerId.toLowerCase()) throw new Error("This export uses a different reviewer code. Start a separate session for another reviewer.");
  if (!isObject(value.labels)) throw new Error("The export has no valid decisions.");
  const known = new Map(cases.map(item => [item.id, item])), labels: Record<string, ReviewLabel> = Object.create(null);
  for (const [id, raw] of Object.entries(value.labels)) {
    const item = known.get(id);
    if (!item || !isObject(raw) || typeof raw.associationType !== "string" || !types.has(raw.associationType)) throw new Error(`Invalid decision or unknown collision: ${id}.`);
    if (!stringArray(raw.acceptableSegmentIds) || !stringArray(raw.acceptableNodeIds)) throw new Error(`Invalid candidate IDs for collision ${id}.`);
    if (typeof raw.rationale !== "string" || [...raw.rationale.trim()].length < 10 || [...raw.rationale].length > 10000) throw new Error(`Collision ${id} needs an evidence rationale.`);
    if (typeof raw.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(raw.reviewedAt) || !Number.isFinite(Date.parse(raw.reviewedAt)) || Number(raw.reviewedAt.slice(0,4)) < 1 || new Date(raw.reviewedAt.slice(0,10) + "T00:00:00Z").toISOString().slice(0,10) !== raw.reviewedAt.slice(0,10)) throw new Error(`Collision ${id} needs a valid review time with a timezone.`);
    const segments = [...new Set(raw.acceptableSegmentIds)], nodes = [...new Set(raw.acceptableNodeIds)];
    if (segments.some(segment => !item.roads.some(road => road.id === segment)) || nodes.some(node => !reviewNodes(item).some(candidate => candidate.id === node))) throw new Error(`Collision ${id} includes an ID outside its frozen source context.`);
    if ((raw.associationType === "segment" && (!segments.length || nodes.length)) || (raw.associationType === "intersection" && (!nodes.length || segments.length)) || (!["segment", "intersection"].includes(raw.associationType) && (segments.length || nodes.length))) throw new Error(`Collision ${id} has IDs that do not fit its assessment.`);
    labels[id] = { associationType: raw.associationType as ReviewLabel["associationType"], acceptableSegmentIds: segments, acceptableNodeIds: nodes, rationale: raw.rationale, reviewedAt: raw.reviewedAt };
  }
  return { schemaVersion: 1, reviewerId, hashes: { ...hashes }, labels };
}
export function reviewImportConflicts(existing: Record<string, ReviewLabel>, incoming: Record<string, ReviewLabel>) { return Object.keys(incoming).filter(id => existing[id] && reviewIdentity(existing[id]) !== reviewIdentity(incoming[id])); }
export function mergeReviewLabels(existing: Record<string, ReviewLabel>, incoming: Record<string, ReviewLabel>, strategy: "reject" | "keep" | "replace" = "reject") {
  if (strategy === "reject" && reviewImportConflicts(existing, incoming).length) throw new Error("Some imported decisions differ from this session. Choose which decisions to keep.");
  const merged = { ...existing };
  for (const [id, label] of Object.entries(incoming)) if (!existing[id] || (strategy === "replace" && reviewIdentity(existing[id]) !== reviewIdentity(label))) merged[id] = label;
  return merged;
}
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
