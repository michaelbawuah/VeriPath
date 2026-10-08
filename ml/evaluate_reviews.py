"""Evaluate independent location reviews against a frozen audit packet.

Agreement is human-reviewed evidence, not verified physical ground truth. Never
publish population accuracy from partial or selectively completed review work.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import re

TYPES = {'segment', 'intersection', 'ambiguous', 'insufficient_location', 'outside_scope'}
SUPPORTED = {'segment', 'intersection'}

def shared_nodes(case):
    endpoints = {}
    for road in case['roads']:
        for node in (road.get('from'), road.get('to')):
            if node and set(node) != {'0'}:
                endpoints.setdefault(node, set()).add(road['id'])
    return {node for node, roads in endpoints.items() if len(roads) > 1}

def validate_review(review, cases, hashes):
    if not isinstance(review,dict):
        raise ValueError('Review must be an object')
    if type(review.get('schemaVersion')) is not int or review['schemaVersion'] != 1 or review.get('hashes') != hashes:
        raise ValueError('Review snapshot hashes/schema do not match the frozen report')
    if not isinstance(review.get('reviewerId'),str) or not review['reviewerId'].strip() or len(review['reviewerId'].strip())>80:
        raise ValueError('A nonempty reviewerId is required')
    labels = review.get('labels')
    if not isinstance(labels, dict):
        raise ValueError('labels must be an object keyed by collision ID')
    for case_id, label in labels.items():
        if not isinstance(label,dict):
            raise ValueError('Every decision must be an object')
        if case_id not in cases or not isinstance(label.get('associationType'),str) or label['associationType'] not in TYPES:
            raise ValueError('Unknown case or association type')
        if not isinstance(label.get('rationale'),str) or len(label['rationale'].strip()) < 10 or len(label['rationale'])>10000:
            raise ValueError('Every decision needs an evidence rationale')
        if not isinstance(label.get('reviewedAt'),str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)',label['reviewedAt']):
            raise ValueError('Every decision needs a string reviewedAt timestamp')
        try:
            timestamp = datetime.datetime.fromisoformat(label['reviewedAt'].replace('Z', '+00:00'))
            if timestamp.tzinfo is None:
                raise ValueError('Timestamp requires a timezone')
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError('Every decision needs a valid zoned reviewedAt timestamp') from error
        segments, nodes = label.get('acceptableSegmentIds'), label.get('acceptableNodeIds')
        if not isinstance(segments, list) or not isinstance(nodes, list) or any(not isinstance(v, str) for v in segments + nodes):
            raise ValueError('Acceptable IDs must be string arrays')
        if not set(segments) <= {road['id'] for road in cases[case_id]['roads']} or not set(nodes) <= shared_nodes(cases[case_id]):
            raise ValueError('Acceptable IDs must occur in the frozen source context')
        kind = label['associationType']
        if (kind == 'segment' and (not segments or nodes)) or (kind == 'intersection' and (not nodes or segments)) or (kind not in SUPPORTED and (segments or nodes)):
            raise ValueError('IDs do not agree with association type')
    return labels

def identity(label):
    return (label['associationType'], tuple(sorted(set(label['acceptableSegmentIds']))), tuple(sorted(set(label['acceptableNodeIds']))))

def correct(prediction, label):
    return ((prediction['status'] == 'strong' and label['associationType'] == 'segment' and prediction['roadId'] in label['acceptableSegmentIds']) or
            (prediction['status'] == 'intersection' and label['associationType'] == 'intersection' and prediction['nodeId'] in label['acceptableNodeIds']))

def metric(numerator, denominator, raw_denominator, complete):
    return {'estimate': numerator / denominator if complete and denominator else None,
            'reviewedSubsetRatio': numerator / denominator if denominator else None,
            'rawDenominator': raw_denominator,
            'weightedDenominator': denominator}

def evaluate(cases, sampling, predictions, hashes, reviews, adjudication=None):
    if not isinstance(reviews,list) or len(reviews) != 2:
        raise ValueError('Exactly two distinct independent reviewers are required')
    decisions = [validate_review(review, cases, hashes) for review in reviews]
    if reviews[0]['reviewerId'].strip().casefold() == reviews[1]['reviewerId'].strip().casefold():
        raise ValueError('Exactly two distinct independent reviewers are required')
    adjudicated = validate_review(adjudication, cases, hashes) if adjudication is not None else {}
    if adjudication and adjudication['reviewerId'].strip().casefold() in {r['reviewerId'].strip().casefold() for r in reviews}:
        raise ValueError('Adjudicator must be independent of both reviewers')
    if set(sampling) != set(cases) or set(predictions) != set(cases):
        raise ValueError('Evaluator packet case IDs do not match')
    final, agreed, disagreements, one_review = {}, 0, 0, 0
    for case_id in cases:
        first, second = (labels.get(case_id) for labels in decisions)
        if not first or not second:
            one_review += bool(first or second)
            if case_id in adjudicated:
                raise ValueError('Adjudication requires two independent decisions')
            continue
        if identity(first) == identity(second):
            if case_id in adjudicated:raise ValueError('Adjudication is only valid for a disagreement')
            agreed += 1
            final[case_id] = first
        else:
            disagreements += 1
            if case_id in adjudicated:
                if datetime.datetime.fromisoformat(adjudicated[case_id]['reviewedAt'].replace('Z','+00:00')) < max(datetime.datetime.fromisoformat(label['reviewedAt'].replace('Z','+00:00')) for label in (first,second)):
                    raise ValueError('Adjudication timestamp must follow both independent decisions')
                final[case_id] = adjudicated[case_id]
    cohorts = {}
    for cohort in ('representative', 'challenge'):
        ids = [case_id for case_id, row in sampling.items() if row['cohort'] == cohort]
        complete = bool(ids) and all(case_id in final for case_id in ids)
        totals = {name: [0., 0., 0] for name in ('segmentPrecision', 'intersectionPrecision', 'supportedAssociationRecall', 'unsupportedAcceptance', 'outOfScopeAcceptance')}
        abstentions = {'correctWithholding': 0, 'missedSupported': 0, 'outsideScope': 0}
        for case_id in ids:
            if case_id not in final:
                continue
            row, label, prediction = sampling[case_id], final[case_id], predictions[case_id]
            probability = row['inclusionProbability']
            if cohort == 'representative' and (not isinstance(probability, (int, float)) or not 0 < probability <= 1):
                raise ValueError('Representative cases require valid sampling probabilities')
            weight = 1 / probability if cohort == 'representative' else 1
            accepted = prediction['status'] in {'strong', 'intersection'}
            supported = label['associationType'] in SUPPORTED
            hit = correct(prediction, label)
            names = []
            if accepted and supported:
                names.append('segmentPrecision' if prediction['status'] == 'strong' else 'intersectionPrecision')
            if supported:
                names.append('supportedAssociationRecall')
            if accepted and label['associationType'] != 'outside_scope':
                names.append('unsupportedAcceptance')
            if accepted:
                names.append('outOfScopeAcceptance')
            for name in names:
                numerator = label['associationType'] in {'ambiguous', 'insufficient_location'} if name == 'unsupportedAcceptance' else label['associationType'] == 'outside_scope' if name == 'outOfScopeAcceptance' else hit
                totals[name][0] += weight * numerator
                totals[name][1] += weight
                totals[name][2] += 1
            if not accepted:
                if supported: abstentions['missedSupported'] += 1
                elif label['associationType'] == 'outside_scope': abstentions['outsideScope'] += 1
                else: abstentions['correctWithholding'] += 1
        cohorts[cohort] = {'selected': len(ids), 'finalized': sum(case_id in final for case_id in ids), 'complete': complete,
                          'populationEstimatesAvailable': complete and cohort == 'representative',
                          'metrics': {name: metric(*values, complete) for name, values in totals.items()}, 'abstentionsRaw': abstentions}
    return {'schemaVersion': 1, 'hashes': hashes, 'reviewedByBoth': agreed + disagreements, 'independentAgreement': agreed / (agreed + disagreements) if agreed + disagreements else None,
            'oneReview': one_review, 'disagreements': disagreements, 'finalized': len(final), 'pendingOrUnresolved': len(cases) - len(final),
            'accuracy': None, 'cohorts': cohorts,
            'limitations': ['Human review agreement is not verified physical ground truth.', 'Precision is conditional on resolvable reviewed locations; unsupported acceptances are reported separately.', 'Partial reviews do not produce population estimates.', 'No confidence interval or release gate is inferred from this small review packet.', 'Challenge results are unweighted and do not estimate population accuracy.']}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--review', type=pathlib.Path, action='append', required=True)
    parser.add_argument('--adjudication', type=pathlib.Path)
    parser.add_argument('--packet', type=pathlib.Path, default=pathlib.Path('ml/audit'))
    parser.add_argument('--quality', type=pathlib.Path, default=pathlib.Path('public/quality'))
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text())
    report = read(args.quality / 'report.json')
    for key, path in {'reviewCases': args.quality / 'cases.json', 'sampling': args.packet / 'sampling.json', 'predictions': args.packet / 'predictions.json'}.items():
        if hashlib.sha256(path.read_bytes()).hexdigest() != report['hashes'].get(key):
            raise ValueError('Frozen evaluator packet hash mismatch: ' + key)
    result = evaluate({case['id']: case for case in read(args.quality / 'cases.json')}, read(args.packet / 'sampling.json'), read(args.packet / 'predictions.json'),
                      report['hashes'], [read(path) for path in args.review], read(args.adjudication) if args.adjudication else None)
    args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps({'finalized': result['finalized'], 'pendingOrUnresolved': result['pendingOrUnresolved']}))

if __name__ == '__main__':
    main()
