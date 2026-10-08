"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, Route, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { reviewNodes, type ReviewCase, type ReviewLabel } from "@/lib/review";
const ReviewMap = dynamic(() => import("@/components/review-map"), { ssr: false });
const decisions: Record<ReviewLabel["associationType"], string> = { segment: "Supported street segment", intersection: "Supported intersection context", ambiguous: "Ambiguous location", insufficient_location: "Insufficient location evidence", outside_scope: "Outside audit scope" };
export default function ReviewWorkbench() {
  const [cases, setCases] = useState<ReviewCase[]>([]), [hashes, setHashes] = useState<Record<string, string>>({});
  const [error, setError] = useState(""), [attempt, setAttempt] = useState(0), [position, setPosition] = useState(0);
  const [reviewer, setReviewer] = useState(""), [labels, setLabels] = useState<Record<string, ReviewLabel>>({});
  const [type, setType] = useState<ReviewLabel["associationType"] | "">(""), [segment, setSegment] = useState(""), [node, setNode] = useState(""), [rationale, setRationale] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setError("");
    Promise.all(["/quality/cases.json", "/quality/report.json"].map(async url => { const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error("Review materials could not load."); return response.json(); })).then(results => { const items = results[0] as ReviewCase[], report = results[1] as { hashes: Record<string, string> }; if (!Array.isArray(items) || !report.hashes) throw new Error("Invalid review materials."); setCases(items); setHashes(report.hashes); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Review materials could not load."); });
    return () => controller.abort();
  }, [attempt]);
  const item = cases[position], nodes = item ? reviewNodes(item) : [];
  const completed = Object.keys(labels).length;
  function navigate(next: number) {
    const label = labels[cases[next].id]; setPosition(next); setType(label?.associationType || ""); setSegment(label?.acceptableSegmentIds[0] || ""); setNode(label?.acceptableNodeIds[0] || ""); setRationale(label?.rationale || "");
  }
  const valid = !!type && rationale.trim().length >= 10 && (type !== "segment" || !!segment) && (type !== "intersection" || !!node);
  function save() { if (!item || !valid || !type) return; setLabels(previous => ({ ...previous, [item.id]: { associationType: type, acceptableSegmentIds: type === "segment" ? [segment] : [], acceptableNodeIds: type === "intersection" ? [node] : [], rationale: rationale.trim(), reviewedAt: new Date().toISOString() } })); }
  function download() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, reviewerId: reviewer.trim(), hashes, labels }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "veripath-review.json"; link.click(); URL.revokeObjectURL(url);
  }
  return <main className="quality-page review-page"><nav className="quality-nav"><Link className="brand" href="/"><span className="brand-symbol"><Route size={23}/></span>VeriPath<span className="brand-period">.</span></Link><Link href="/quality"><ArrowLeft size={16}/>Evidence quality</Link></nav>
    <div className="eyebrow">INDEPENDENT LOCATION REVIEW</div><h1>Read the evidence.<br/><span>Record your judgment.</span></h1><p className="quality-lead">Matcher predictions and sampling strata are hidden from this workspace. Review source coordinates, reported names and raw nearby roads. A nearest cross street is context; it does not prove a crash happened at a junction.</p>
    <div className="review-toolbar"><label>Reviewer code<Input placeholder="e.g. reviewer-a" value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={80}/></label><span>{completed} / {cases.length || 260} decisions recorded</span><Button variant="outline" onClick={download} disabled={!reviewer.trim() || !completed}><Download size={16}/>Export decisions</Button></div>
    <p className="quality-note">Decisions stay in this session until exported. Another reviewer should work independently. Exports require agreement or adjudication before they can produce correctness metrics. This is presentation blinding; repository access is not a secure barrier.</p>
    {error ? <div className="error-state" role="alert">{error}<Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Retry</Button></div> : !item ? <p role="status">Loading frozen review material…</p> : <>
      <div className="case-navigation"><Button variant="outline" onClick={() => navigate(position - 1)} disabled={!position}><ArrowLeft size={16}/>Previous</Button><span>Case {position + 1} of {cases.length} {labels[item.id] && <Check size={16} aria-label="Decision recorded"/>}</span><Button variant="outline" onClick={() => navigate(position + 1)} disabled={position === cases.length - 1}>Next<ArrowRight size={16}/></Button></div>
      <div className="review-grid"><section><div className="review-source"><h2>Collision report {item.id}</h2><dl><div><dt>Date / borough</dt><dd>{item.date} · {item.borough}</dd></div><div><dt>Reported collision street</dt><dd>{item.onStreet || "Not reported"}</dd></div><div><dt>Nearest cross street</dt><dd>{item.nearestCrossStreet || "Not reported"}</dd></div><div><dt>Address / location text</dt><dd>{item.locationText || "Not reported"}</dd></div><div><dt>Coordinates</dt><dd>{item.coordinate ? item.coordinate.map(n => n.toFixed(6)).join(", ") + " (longitude, latitude)" : "Missing"}</dd></div><div><dt>Injury / fatality modes</dt><dd>{item.modes.join(", ") || "Not specified"}</dd></div></dl></div><ReviewMap item={item} segment={segment} node={node}/><p className="quality-note">Red ring: reported coordinates. Grey: source road geometry. Purple: raw shared node IDs, including elevated and unknown levels. Map basemap and road snapshot may differ.</p></section>
      <section className="review-decision"><h2>Your location assessment</h2><label htmlFor="review-type">Association type</label><NativeSelect id="review-type" value={type} onChange={e => { setType(e.target.value as typeof type); setSegment(""); setNode(""); }}><NativeSelectOption value="">Choose an assessment</NativeSelectOption>{Object.entries(decisions).map(([key, label]) => <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>)}</NativeSelect>
      {type === "segment" && <><label htmlFor="review-segment">Acceptable segment</label><NativeSelect id="review-segment" value={segment} onChange={e => setSegment(e.target.value)}><NativeSelectOption value="">Choose a source segment</NativeSelectOption>{item.roads.map(road => <NativeSelectOption key={road.id} value={road.id}>{road.id} · {road.street || "Unnamed"} · {road.levels || "unknown level"}</NativeSelectOption>)}</NativeSelect></>}
      {type === "intersection" && <><label htmlFor="review-node">Acceptable shared node</label><NativeSelect id="review-node" value={node} onChange={e => setNode(e.target.value)}><NativeSelectOption value="">Choose a source node</NativeSelectOption>{nodes.map(n => <NativeSelectOption key={n.id} value={n.id}>{n.id} · {n.roads.length} nearby segments</NativeSelectOption>)}</NativeSelect></>}
      <label htmlFor="review-rationale">Evidence and uncertainty</label><Textarea id="review-rationale" value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Explain why the coordinates, street names and topology support your assessment. Note conflicting evidence." rows={6}/><p className="quality-note">At least 10 characters. Record ambiguity when the report cannot distinguish nearby roads or intersections.</p><Button className="quality-save" onClick={save} disabled={!valid}><Check size={16}/>Record decision</Button><p className="quality-note">No assessment is preselected. Recording a decision does not certify a route’s safety.</p></section></div>
    </>}
  </main>;
}
