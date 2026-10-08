# VeriPath independent location review

Assess what the source report supports, rather than trying to reproduce the matcher. This frozen packet contains 260 NYC injury/fatal crash reports from 2021–2025. It evaluates ground-level street and intersection context, not responsibility, movement direction, collision probability or route safety.

The source-case SHA-256 is `c89e416291cdc24d2c1bf9ffed544c38bd780c5a0253f9cd2e7d8a92c49e138c`. Exports include the complete frozen audit hash set automatically. Preserve it unchanged. An export from another audit version requires its original packet.

## Work independently

Use your assigned reviewer code and a separate browser session. Do not inspect matcher predictions, sampling strata, evaluation files, repository implementation or another reviewer’s decisions before finishing your own review. The interface hides predictions; repository access is not a secure blinding barrier.

Read the report’s coordinates, street names, address/location text and raw road context. Write a rationale describing supporting evidence, contradictions and uncertainty. Do not force an association merely because a road is nearby.

## Choose one assessment

- **Supported street segment:** the evidence supports street-segment context. Select every source segment ID that is independently acceptable.
- **Supported intersection context:** the evidence supports a physical, ground-level junction. Select every independently acceptable shared-node ID.
- **Ambiguous location:** credible evidence points to competing locations or association types that the report cannot distinguish.
- **Insufficient location evidence:** missing, unusable or incomplete evidence prevents a defensible association.
- **Outside audit scope:** the evidence clearly places the report outside this ground-level study, such as a confirmed elevated/tunnel location or outside its geographic study area.

Select multiple IDs only when each is supported; do not use a long selection list to conceal uncertainty. Ambiguous, insufficient and outside-scope decisions have no acceptable IDs. Only IDs in that case’s frozen source context are valid.

## Interpret the map carefully

The red marker is the reported coordinate, grey lines are source roads, and purple markers are raw shared nodes. None is an independently verified collision location.

“Nearest cross street” identifies a nearby street; it does not establish intersection involvement. Address/location text is a separate field. A line crossing on the map does not prove a physical junction.

Road levels preserve source endpoint codes. `MM` is the audit’s ground-level code. Other, mixed or unknown levels require care: do not assume they represent ground-level roads. Raw shared nodes include non-ground and unknown context. Current geometry may differ from conditions on the report date.

## Record, export and resume

Enter your reviewer code, choose an assessment, select applicable IDs and write your rationale. **Record decision** saves that case within the current tab. Reviewer codes then stay fixed.

Drafts survive case navigation but not leaving the page, reloading or closing the tab. **Export decisions** downloads recorded decisions only. Keep the JSON file and export after each work session. Nothing is uploaded automatically.

To resume, import your export into the same frozen packet using the same reviewer code. Record or discard drafts before importing. If copies conflict, explicitly choose which copy to keep. Import conflicts can include changed rationales, even when the assessment and IDs are the same.

## Coordinator and adjudicator

Two distinct human reviewers must finish independently. A third distinct reviewer adjudicates only cases with two differing association-type/ID-set decisions, after reading both rationales. Rationale or timestamp differences alone are not evaluator disagreements. The adjudication timestamp must be no earlier than either original decision. Agreed cases and cases with only one decision cannot be adjudicated.

Incomplete or unresolved cases remain pending. Human agreement is reviewed evidence, not verified physical ground truth. A partial representative review cannot establish population accuracy; challenge cases are reported separately.
