"""
Trains and evaluates the shot-quality classifier, and writes real
evaluation artifacts to ml/results/ -- a classification report, a
confusion matrix (as both a PNG and raw numbers), and feature
importances. Run this file directly to regenerate everything:

    python train_shot_quality_model.py
"""
import json
import os

import joblib
import matplotlib
matplotlib.use("Agg")  # headless -- this runs in CI, not on a desktop
import matplotlib.pyplot as plt
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    f1_score, precision_score, recall_score,
)
from sklearn.model_selection import cross_val_score, train_test_split

from dataset import QUALITY_LABELS, generate

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(RESULTS_DIR, exist_ok=True)


def evaluate(name, model, X_test, y_test):
    preds = model.predict(X_test)
    return {
        "model": name,
        "accuracy": accuracy_score(y_test, preds),
        "precision_macro": precision_score(y_test, preds, average="macro", zero_division=0),
        "recall_macro": recall_score(y_test, preds, average="macro", zero_division=0),
        "f1_macro": f1_score(y_test, preds, average="macro", zero_division=0),
    }, preds


def main():
    X, y = generate(n_samples=3000, seed=42)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Baseline: predicts the most common class every time. If the real
    # model can't beat this, it isn't learning anything -- this number
    # exists specifically so "the model works" isn't just asserted.
    baseline = DummyClassifier(strategy="most_frequent")
    baseline.fit(X_train, y_train)
    baseline_metrics, _ = evaluate("Baseline (majority class)", baseline, X_test, y_test)

    model = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=42)
    model.fit(X_train, y_train)
    model_metrics, preds = evaluate("Random Forest", model, X_test, y_test)

    cv_scores = cross_val_score(model, X, y, cv=5, scoring="f1_macro")

    report = classification_report(y_test, preds, labels=QUALITY_LABELS, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, preds, labels=QUALITY_LABELS)

    importances = dict(zip(X.columns, model.feature_importances_))

    print("=" * 60)
    print("BASELINE (majority-class):", baseline_metrics)
    print("MODEL (Random Forest):    ", model_metrics)
    print(f"5-fold CV F1 (macro): {cv_scores.mean():.3f} +/- {cv_scores.std():.3f}")
    print("Feature importances:", importances)
    print("=" * 60)
    print(classification_report(y_test, preds, labels=QUALITY_LABELS, zero_division=0))

    # --- persist real artifacts, not just console output ---
    with open(os.path.join(RESULTS_DIR, "metrics.json"), "w") as f:
        json.dump({
            "baseline": baseline_metrics,
            "model": model_metrics,
            "cv_f1_macro_mean": float(cv_scores.mean()),
            "cv_f1_macro_std": float(cv_scores.std()),
            "classification_report": report,
            "feature_importances": importances,
            "test_set_size": len(y_test),
            "train_set_size": len(y_train),
        }, f, indent=2)

    fig, ax = plt.subplots(figsize=(5, 4.5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(QUALITY_LABELS)))
    ax.set_yticks(range(len(QUALITY_LABELS)))
    ax.set_xticklabels(QUALITY_LABELS, rotation=30, ha="right")
    ax.set_yticklabels(QUALITY_LABELS)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Shot Quality — Confusion Matrix (test set)")
    for i in range(len(QUALITY_LABELS)):
        for j in range(len(QUALITY_LABELS)):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                     color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(os.path.join(RESULTS_DIR, "confusion_matrix.png"), dpi=150)
    plt.close(fig)

    joblib.dump(model, os.path.join(RESULTS_DIR, "shot_quality_model.joblib"))

    print(f"\nArtifacts written to {RESULTS_DIR}/")
    return model_metrics, baseline_metrics


if __name__ == "__main__":
    main()
