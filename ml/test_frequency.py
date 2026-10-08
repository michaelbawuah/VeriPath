import json, pathlib, unittest
import numpy as np
from train_frequency import feature_matrix, baselines, metrics, release_gate

class ForecastIntegrity(unittest.TestCase):
    def test_future_labels_do_not_enter_features(self):
        counts=np.array([[0.,1.,2.,3.,4.],[0.,0.,0.,0.,0.]])
        before=feature_matrix(np.array([100.,200.]),counts,2025)
        counts[:,4]=999999
        np.testing.assert_array_equal(before,feature_matrix(np.array([100.,200.]),counts,2025))
        self.assertEqual(before.shape,(2,3))
    def test_baselines_include_zero_segments_and_positive_predictions(self):
        counts=np.zeros((2,5));base=baselines(np.array([100.,200.]),counts,2025,np.zeros(4),np.array([100.,200.,100.,200.]))
        self.assertTrue(all(len(p)==2 and np.all(p>0) for p in base.values()))
        self.assertTrue(np.isfinite(metrics(np.zeros(2),base['history_mean'])['poisson_deviance']))
    def test_uncertain_or_miscalibrated_gains_are_withheld(self):
        self.assertFalse(release_gate(.01,[-.01,.03],1.,[])[0])
        self.assertFalse(release_gate(.01,[.001,.03],1.,[{"observed":100,"predicted":40}])[0])
    def test_current_model_is_withheld_when_baseline_wins(self):
        report=json.loads(pathlib.Path('public/model/validation.json').read_text())
        for mode in report['modes'].values():
            if mode['test']['poisson_deviance']>=mode['baseline_test']['poisson_deviance']:
                self.assertFalse(mode['enabled'])
        self.assertEqual(report['split']['test'],2025)
if __name__=='__main__':unittest.main()
