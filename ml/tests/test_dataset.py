import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dataset import generate, weakest_component, SENSOR_BOUNDS, QUALITY_LABELS  # noqa: E402


class TestGenerate:
    def test_returns_requested_sample_count(self):
        X, y = generate(n_samples=500)
        assert len(X) == 500
        assert len(y) == 500

    def test_features_within_documented_sensor_bounds(self):
        X, _ = generate(n_samples=2000)
        for col, (lo, hi) in SENSOR_BOUNDS.items():
            assert X[col].min() >= lo
            assert X[col].max() <= hi

    def test_labels_are_only_the_three_known_classes(self):
        _, y = generate(n_samples=1000)
        assert set(y.unique()) <= set(QUALITY_LABELS)

    def test_deterministic_given_same_seed(self):
        X1, y1 = generate(n_samples=200, seed=7)
        X2, y2 = generate(n_samples=200, seed=7)
        assert X1.equals(X2)
        assert (y1 == y2).all()

    def test_different_seeds_produce_different_data(self):
        X1, _ = generate(n_samples=200, seed=1)
        X2, _ = generate(n_samples=200, seed=2)
        assert not X1.equals(X2)

    def test_no_class_is_empty_at_reasonable_sample_size(self):
        # A labeling rule that only ever produces one class would be
        # useless for classification -- this catches that regression.
        _, y = generate(n_samples=3000)
        counts = y.value_counts()
        assert len(counts) == 3
        assert counts.min() > 0


class TestWeakestComponent:
    def test_low_speed_flags_power(self):
        weakest, _ = weakest_component(speed=5, spin=1200, force=1000, distance=75)
        assert weakest == "power"

    def test_spin_far_from_target_flags_spin_control(self):
        weakest, _ = weakest_component(speed=180, spin=2900, force=1000, distance=75)
        assert weakest == "spin control"

    def test_mismatched_force_and_distance_flags_efficiency(self):
        weakest, _ = weakest_component(speed=180, spin=1200, force=1900, distance=5)
        assert weakest == "strike efficiency"

    def test_returns_a_recommendation_string(self):
        _, recommendation = weakest_component(speed=100, spin=1200, force=1000, distance=75)
        assert isinstance(recommendation, str)
        assert len(recommendation) > 10
