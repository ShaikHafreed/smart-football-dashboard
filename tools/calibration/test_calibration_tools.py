"""
Tests for the calibration tooling.

These do not validate any sensor - no hardware is involved. They check that
the parser reads what the firmware prints, and that the fitter recovers a
known line and refuses a dataset that should not become a calibration.
That second half matters most: the tool's job is to say no.

    python -m pytest tools/calibration -q
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import capture  # noqa: E402
import fit_speed_model as fit_tool  # noqa: E402


# ==========================================
# Serial log parsing
# ==========================================

class TestParseLine:
    def test_reads_an_impact_record(self):
        kind, fields = capture.parse_line(
            "CAL_IMPACT,ms=48210,peak_g=7.412,peak_rpm=182.55,speed_index=46.33,"
            "carry_index=69.49,samples=94,accel_saturated=0,gyro_saturated=0"
        )
        assert kind == "CAL_IMPACT"
        assert fields["peak_g"] == "7.412"
        assert fields["samples"] == "94"
        assert fields["accel_saturated"] == "0"

    def test_reads_the_rest_check(self):
        kind, fields = capture.parse_line("CAL_REST,mean_g=1.0021,min_g=0.9980,max_g=1.0064,samples=196")
        assert kind == "CAL_REST"
        assert fields["mean_g"] == "1.0021"

    def test_reads_the_configuration_banner(self):
        kind, fields = capture.parse_line(
            "CAL_INFO,fw=1.1.0,accel_range_g=16.0,gyro_range_dps=2000.0,"
            "accel_lsb_per_g=2048.0,gyro_lsb_per_dps=16.4,window_ms=120,speed_calibrated=0"
        )
        assert kind == "CAL_INFO"
        assert fields["accel_lsb_per_g"] == "2048.0"
        assert fields["speed_calibrated"] == "0"

    def test_ignores_ordinary_firmware_chatter(self):
        """A calibration log is a normal serial log with records in it."""
        for line in ("WiFi connected: venue-wifi", "Kick sent -> 200", "", "   "):
            assert capture.parse_line(line) is None

    def test_ignores_a_lookalike_prefix(self):
        assert capture.parse_line("CALIBRATION starting") is None


class TestCollect:
    def test_groups_records_and_keeps_notes_separate(self):
        lines = [
            "CAL_INFO,fw=1.1.0,window_ms=120",
            "Registering device, uid=ABC",
            "CAL_REST,mean_g=0.998,samples=190",
            "CAL_NOTE,hold the ball still at boot",
            "CAL_IMPACT,ms=1,peak_g=3.1",
            "CAL_IMPACT,ms=2,peak_g=9.4",
        ]
        grouped, notes = capture.collect(lines)

        assert len(grouped["CAL_IMPACT"]) == 2
        assert len(grouped["CAL_REST"]) == 1
        assert len(grouped["CAL_SPIN"]) == 0
        assert len(notes) == 1
        assert grouped["CAL_IMPACT"][0]["peak_g"] == "3.1"

    def test_survives_a_truncated_line(self):
        grouped, _ = capture.collect(["CAL_IMPACT,ms=1,peak_g", "CAL_IMPACT,ms=2,peak_g=5.0"])
        assert len(grouped["CAL_IMPACT"]) == 2  # first keeps ms, drops the broken pair


class TestWriteCsv:
    def test_writes_the_union_of_keys(self, tmp_path):
        path = tmp_path / "impacts.csv"
        written = capture.write_csv(str(path), [{"a": "1"}, {"a": "2", "b": "3"}])

        assert written == 2
        header = path.read_text(encoding="utf-8").splitlines()[0]
        assert header == "a,b"

    def test_writes_nothing_for_no_rows(self, tmp_path):
        assert capture.write_csv(str(tmp_path / "x.csv"), []) == 0


# ==========================================
# Model fitting
# ==========================================

def _clean_dataset(gain=6.0, offset=10.0, n=40):
    """A dataset that should pass: a real gradient, a wide spread, no noise."""
    rows = []
    for i in range(n):
        peak_g = 2.0 + (i / (n - 1)) * 10.0     # 2 g to 12 g
        rows.append((peak_g, gain * peak_g + offset))
    return rows


class TestFit:
    def test_recovers_a_known_line(self):
        result = fit_tool.fit(_clean_dataset(gain=6.0, offset=10.0))
        assert result["gain"] == pytest.approx(6.0, abs=1e-6)
        assert result["offset"] == pytest.approx(10.0, abs=1e-6)
        assert result["r_squared"] == pytest.approx(1.0, abs=1e-9)
        assert result["rmse"] == pytest.approx(0.0, abs=1e-9)

    def test_reports_the_range_the_fit_covers(self):
        result = fit_tool.fit(_clean_dataset())
        assert result["g_range"][0] == pytest.approx(2.0)
        assert result["g_range"][1] == pytest.approx(12.0)

    def test_residuals_reflect_scatter(self):
        rows = _clean_dataset()
        rows[0] = (rows[0][0], rows[0][1] + 10.0)   # one bad strike
        result = fit_tool.fit(rows)
        assert result["max_abs_residual"] > 5.0
        assert result["r_squared"] < 1.0

    def test_refuses_a_single_observation(self):
        with pytest.raises(fit_tool.Refusal):
            fit_tool.fit([(5.0, 40.0)])

    def test_refuses_when_every_strike_is_identical(self):
        with pytest.raises(fit_tool.Refusal):
            fit_tool.fit([(5.0, 40.0)] * 40)


class TestAcceptance:
    """The checks that stand between a dataset and a physical unit."""

    def test_a_good_dataset_passes(self):
        assert fit_tool.check(fit_tool.fit(_clean_dataset())) == []

    def test_too_few_strikes_is_refused(self):
        problems = fit_tool.check(fit_tool.fit(_clean_dataset(n=12)))
        assert any("usable strikes" in p for p in problems)

    def test_a_narrow_power_range_is_refused(self):
        """Thirty identical-strength strikes say nothing about the gradient."""
        rows = [(5.0 + i * 0.01, 40.0 + i * 0.06) for i in range(40)]
        problems = fit_tool.check(fit_tool.fit(rows))
        assert any("peak_g only spans" in p for p in problems)

    def test_a_poor_relationship_is_refused(self):
        """Scatter with no trend must not become a coefficient."""
        rows = [(2.0 + (i % 11), 40.0 + (i * 37 % 29)) for i in range(40)]
        problems = fit_tool.check(fit_tool.fit(rows))
        assert problems  # R^2 and/or residual spread
        assert any("R^2" in p or "residual spread" in p for p in problems)

    def test_the_refusal_names_what_to_do_instead(self):
        problems = fit_tool.check(fit_tool.fit(_clean_dataset(n=12)))
        assert any("at least" in p for p in problems)


class TestPairedInput:
    def test_saturated_rows_are_dropped(self, tmp_path):
        """A clipped peak is a lower bound, not a measurement."""
        path = tmp_path / "paired.csv"
        path.write_text(
            "peak_g,reference_kmh,accel_saturated\n"
            "3.0,25.0,0\n"
            "16.0,95.0,1\n"
            "5.0,38.0,0\n",
            encoding="utf-8",
        )
        rows, dropped = fit_tool.read_paired(str(path))
        assert dropped == 1
        assert len(rows) == 2

    def test_missing_columns_are_skipped_not_guessed(self, tmp_path):
        path = tmp_path / "paired.csv"
        path.write_text("peak_g,reference_kmh\n3.0,25.0\n,,\nbad,30\n", encoding="utf-8")
        rows, _ = fit_tool.read_paired(str(path))
        assert rows == [(3.0, 25.0)]

    def test_end_to_end_refusal_exits_nonzero(self, tmp_path, capsys):
        path = tmp_path / "paired.csv"
        path.write_text(
            "peak_g,reference_kmh\n" + "".join(f"{2 + i * 0.05},{30 + i * 0.3}\n" for i in range(10)),
            encoding="utf-8",
        )
        code = fit_tool.main(["--paired", str(path)])
        assert code == 1
        assert "NOT A CALIBRATION" in capsys.readouterr().out

    def test_end_to_end_pass_emits_the_defines(self, tmp_path, capsys):
        rows = _clean_dataset()
        path = tmp_path / "paired.csv"
        path.write_text(
            "peak_g,reference_kmh\n" + "".join(f"{g},{v}\n" for g, v in rows),
            encoding="utf-8",
        )
        code = fit_tool.main(["--paired", str(path)])
        out = capsys.readouterr().out

        assert code == 0
        assert "#define SPEED_CALIBRATED         1" in out
        assert "SPEED_MODEL_GAIN" in out
        assert "R^2" in out and "RMSE" in out          # never coefficients alone
        assert "extrapolating" in out                   # states where it is valid
