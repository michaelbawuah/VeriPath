"""Synthetic unit fixtures; these are not independent review labels."""
import copy
import unittest
from evaluate_reviews import evaluate

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.cases = {'1': {'roads': [{'id': 'a', 'from': 'n', 'to': 'x'}, {'id': 'b', 'from': 'n', 'to': 'y'}]}, '2': {'roads': []}}
        self.sampling = {'1': {'cohort': 'representative', 'inclusionProbability': .1}, '2': {'cohort': 'challenge', 'inclusionProbability': None}}
        self.predictions = {'1': {'status': 'intersection', 'nodeId': 'n', 'roadId': None}, '2': {'status': 'unmatched', 'nodeId': None, 'roadId': None}}
        self.hashes = {'roads': 'frozen'}
        self.label = {'associationType': 'intersection', 'acceptableSegmentIds': [], 'acceptableNodeIds': ['n'], 'rationale': 'Names and coordinates support node n.', 'reviewedAt': '2026-10-08T12:00:00Z'}
        self.reviews = [{'schemaVersion': 1, 'reviewerId': who, 'hashes': self.hashes, 'labels': {'1': copy.deepcopy(self.label)}} for who in ['a', 'b']]
    def run_eval(self, adjudication=None):
        return evaluate(self.cases, self.sampling, self.predictions, self.hashes, self.reviews, adjudication)
    def test_agreement_and_weights(self):
        metric = self.run_eval()['cohorts']['representative']['metrics']['intersectionPrecision']
        self.assertEqual(metric['estimate'], 1)
        self.assertEqual(metric['weightedDenominator'], 10)
        self.assertEqual(self.run_eval()['accuracy'], None)
    def test_disagreement_excluded_until_independent_adjudication(self):
        self.reviews[1]['labels']['1'].update(associationType='ambiguous', acceptableNodeIds=[])
        self.assertEqual(self.run_eval()['finalized'], 0)
        third = {'schemaVersion': 1, 'reviewerId': 'c', 'hashes': self.hashes, 'labels': {'1': self.label}}
        self.assertEqual(self.run_eval(third)['finalized'], 1)
        third['reviewerId'] = 'a'
        with self.assertRaises(ValueError): self.run_eval(third)
    def test_partial_population_estimate_withheld(self):
        self.reviews[1]['labels'] = {}
        result = self.run_eval()['cohorts']['representative']
        self.assertFalse(result['populationEstimatesAvailable'])
        self.assertIsNone(result['metrics']['intersectionPrecision']['estimate'])
    def test_snapshot_and_candidate_validation(self):
        self.reviews[1]['hashes'] = {}
        with self.assertRaises(ValueError): self.run_eval()
        self.reviews[1]['hashes'] = self.hashes
        self.reviews[1]['labels']['1']['acceptableNodeIds'] = ['invented']
        with self.assertRaises(ValueError): self.run_eval()
    def test_no_self_review(self):
        self.reviews[1]['reviewerId'] = 'a'
        with self.assertRaises(ValueError): self.run_eval()
    def test_normalized_reviewer_identity(self):
        self.reviews[1]['reviewerId'] = ' A '
        with self.assertRaises(ValueError): self.run_eval()
    def test_out_of_scope_acceptance_is_visible(self):
        for review in self.reviews:
            review['labels']['1'].update(associationType='outside_scope', acceptableNodeIds=[])
        result = self.run_eval()['cohorts']['representative']['metrics']
        self.assertEqual(result['outOfScopeAcceptance']['estimate'], 1)
        self.assertEqual(result['intersectionPrecision']['rawDenominator'], 0)
    def test_malformed_review_values_fail_cleanly(self):
        for raw in (None, [], 42):
            with self.subTest(raw=raw):
                self.reviews[0] = raw
                with self.assertRaises(ValueError): self.run_eval()
        self.setUp()
        for key, value in [('reviewerId', 42), ('schemaVersion', True)]:
            self.reviews[0][key] = value
            with self.assertRaises(ValueError): self.run_eval()
            self.setUp()
        for key, value in [('rationale', 123), ('reviewedAt', 123), ('associationType', []), ('reviewedAt', '2026-10-08 12:00:00Z'), ('reviewedAt', '2026-10-08T24:00:00Z'), ('reviewedAt', '2026-10-08T12:60:00Z'), ('reviewedAt', '2026-10-08T12:00:60Z')]:
            self.reviews[0]['labels']['1'][key] = value
            with self.assertRaises(ValueError): self.run_eval()
            self.setUp()
    def test_empty_cohort_has_no_population_estimate(self):
        self.sampling['1'].update(cohort='challenge', inclusionProbability=None)
        self.assertFalse(self.run_eval()['cohorts']['representative']['populationEstimatesAvailable'])
    def test_unnecessary_adjudication_rejected(self):
        third = {'schemaVersion': 1, 'reviewerId': 'c', 'hashes': self.hashes, 'labels': {'1': self.label}}
        with self.assertRaises(ValueError): self.run_eval(third)

if __name__ == '__main__': unittest.main()
