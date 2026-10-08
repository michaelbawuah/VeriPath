// Synthetic schema/workflow fixtures; never independent review labels.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temporary=await mkdtemp(join(tmpdir(),'veripath-review-'));
try {
  await writeFile(join(temporary,'review.mjs'),ts.transpileModule(await readFile('lib/review.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  const {parseReviewExport,mergeReviewLabels,reviewImportConflicts,hasReviewChanges,blankReview}=await import(pathToFileURL(join(temporary,'review.mjs')));
  const cases=[{id:'fixture-1',roads:[{id:'west',from:'w',to:'n',coordinates:[[0,0],[1,0]]},{id:'east',from:'n',to:'e',coordinates:[[1,0],[2,0]]}]},{id:'fixture-2',roads:[]}],hashes={roads:'synthetic-road-hash',reviewCases:'synthetic-packet-hash'};
  const label={associationType:'segment',acceptableSegmentIds:['west','east'],acceptableNodeIds:[],rationale:'Synthetic fixture: both segments are acceptable.',reviewedAt:'2026-10-08T12:00:00Z'};
  const packet={schemaVersion:1,reviewerId:'Reviewer-A',hashes,labels:{'fixture-1':label}};
  const imported=parseReviewExport(JSON.parse(JSON.stringify(packet)),cases,hashes);
  assert.deepEqual(imported.labels['fixture-1'].acceptableSegmentIds,['west','east'],'Multiple acceptable IDs survive export/import');
  assert.equal(imported.labels['fixture-1'].reviewedAt,label.reviewedAt,'Imports preserve review timestamps');
  assert.equal(parseReviewExport(packet,cases,hashes,' reviewer-a ').reviewerId,'Reviewer-A');
  assert.throws(()=>parseReviewExport(packet,cases,hashes,'reviewer-b'),/different reviewer/);
  assert.throws(()=>parseReviewExport(packet,cases,{...hashes,roads:'changed'}),/different frozen audit/);
  const invalid=structuredClone(packet);invalid.labels['fixture-2']={...label,acceptableSegmentIds:['invented']};
  const before=JSON.stringify(packet);assert.throws(()=>parseReviewExport(invalid,cases,hashes),/outside its frozen source/);assert.equal(JSON.stringify(packet),before,'Invalid imports cannot mutate current decisions');
  for(const reviewedAt of ['2026-02-30T12:00:00Z','2026-10-08T24:00:00Z','2026-10-08T12:60:00Z','2026-10-08T12:00:60Z','2026-10-08T12:00:00','2026-10-08 12:00:00Z',12])assert.throws(()=>parseReviewExport({...packet,labels:{'fixture-1':{...label,reviewedAt}}},cases,hashes),/review time/);
  for(const raw of [null,[],123,{...packet,reviewerId:42},{...packet,labels:{'fixture-1':null}},{...packet,labels:{'unknown':label}}])assert.throws(()=>parseReviewExport(raw,cases,hashes));
  assert.throws(()=>parseReviewExport({...packet,labels:{'fixture-1':{...label,rationale:'🙂🙂🙂🙂🙂'}}},cases,hashes),/rationale/);
  const changed={...label,rationale:'Synthetic alternative evidence decision.',reviewedAt:'2026-10-08T13:00:00Z'},existing={'fixture-1':label},incoming={'fixture-1':changed};
  assert.deepEqual(reviewImportConflicts(existing,incoming),['fixture-1']);assert.throws(()=>mergeReviewLabels(existing,incoming),/differ/);
  assert.equal(mergeReviewLabels(existing,incoming,'keep')['fixture-1'],label);
  assert.equal(mergeReviewLabels(existing,incoming,'replace')['fixture-1'],changed);
  assert.equal(mergeReviewLabels(existing,{'fixture-1':{...label,reviewedAt:'2026-10-08T14:00:00Z'}})['fixture-1'].reviewedAt,label.reviewedAt,'Identical decisions do not silently change timestamps');
  assert(!hasReviewChanges(blankReview(),undefined));assert(!hasReviewChanges({...label},label));assert(hasReviewChanges(changed,label));
  assert.equal(Object.keys(existing).length,1,'Merge is non-mutating');
  console.log('Passed review safeguards: multi-ID round trip, snapshot and identity binding, atomic invalid imports, zoned timestamps, explicit merge conflicts, unchanged timestamps and draft detection.');
} finally {await rm(temporary,{recursive:true,force:true});}
