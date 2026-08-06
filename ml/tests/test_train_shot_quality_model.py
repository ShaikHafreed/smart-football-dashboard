import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sklearn.model_selection import train_test_split  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: E402

from dataset import generate  # noqa: E402
from train_shot_quality_model import evaluate  # noqa: E402


class TestModelBeatsBaseline:
    """The one thing that actually matters for a PoC: does the model
    learn something real, not just memorize the majority class? Uses a
    smaller sample than the full training run so this stays fast in CI."""

    def setup_method(self):
        X, y = generate(n_samples=800, seed=42)
        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

    def test_model_beats_majority_class_baseline_on_f1(self):
        from sklearn.dummy import DummyClassifier

        baseline = DummyClassifier(strategy="most_frequent")
        baseline.fit(self.X_train, self.y_train)
        baseline_metrics, _ = evaluate("baseline", baseline, self.X_test, self.y_test)

        model = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
        model.fit(self.X_train, self.y_train)
        model_metrics, _ = evaluate("model", model, self.X_test, self.y_test)

        assert model_metrics["f1_macro"] > baseline_metrics["f1_macro"]
        assert model_metrics["accuracy"] > baseline_metrics["accuracy"]

    def test_model_beats_random_guessing(self):
        # 3 classes -> random guessing scores ~0.33 accuracy
        model = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
        model.fit(self.X_train, self.y_train)
        metrics, _ = evaluate("model", model, self.X_test, self.y_test)
        assert metrics["accuracy"] > 0.45

    def test_predictions_are_only_known_labels(self):
        from dataset import QUALITY_LABELS

        model = RandomForestClassifier(n_estimators=50, random_state=42)
        model.fit(self.X_train, self.y_train)
        preds = model.predict(self.X_test)
        assert set(preds) <= set(QUALITY_LABELS)
