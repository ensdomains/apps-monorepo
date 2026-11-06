import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent.parent
TLC_TOOL = (
    "http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/"
    "v1.7.4/tla2tools.jar,checksum=sha256:"
    "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4"
)


def installed_tool(*args):
    return subprocess.check_output(["mise", *args], text=True).strip()


class VerificationRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.java_bin = os.environ.get("JAVA_BIN") or installed_tool(
            "which", "java", "--tool", "java@temurin-25"
        )
        cls.tlc_jar = os.environ.get("TLC_JAR") or str(
            Path(installed_tool("where", TLC_TOOL)) / "tla2tools.jar"
        )

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pr-1640-", dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / "formal", self.root / "formal")
        self.model = self.root / "formal/pr-1640-safe-renewal"
        self.env = {
            **os.environ,
            "JAVA_BIN": self.java_bin,
            "TLC_JAR": self.tlc_jar,
            "FORMAL_OUT_DIR": str(self.root / "logs"),
        }

    def run_verifier(self):
        return subprocess.run(
            ["bash", str(self.root / "formal/verify-pr-1640.sh")],
            env=self.env,
            capture_output=True,
            text=True,
            timeout=60,
        )

    def assert_rejected(self):
        result = self.run_verifier()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "current-pr-head: PendingSafeCheckHidesSessionControls", result.stdout
        )
        self.assertNotIn("model sensitivity passed", result.stdout)

    def use_failing_java(self, failure):
        launcher = self.root / "java"
        launcher.write_text(
            '#!/usr/bin/env bash\n'
            'case " $* " in\n'
            '  *" -config Current.cfg "*) exec "$REAL_JAVA_BIN" "$@" ;;\n'
            'esac\n'
            + failure
        )
        launcher.chmod(0o755)
        self.env = {**self.env, "JAVA_BIN": str(launcher), "REAL_JAVA_BIN": self.java_bin}

    def test_accepts_model_and_each_intended_counterexample(self):
        result = self.run_verifier()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("model sensitivity passed", result.stdout)

    def test_preserves_existing_files_and_previous_run_logs(self):
        logs = Path(self.env["FORMAL_OUT_DIR"])
        logs.mkdir()
        unrelated = logs / "unrelated.txt"
        unrelated.write_text("keep this evidence\n")

        first = self.run_verifier()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        self.assertEqual(unrelated.read_text(), "keep this evidence\n")
        first_runs = set(logs.iterdir()) - {unrelated}
        self.assertEqual(len(first_runs), 1)
        first_run = next(iter(first_runs))
        first_log = first_run / "current-pr-head/tlc.out"
        evidence = first_log.read_bytes()

        second = self.run_verifier()
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertEqual(unrelated.read_text(), "keep this evidence\n")
        self.assertEqual(first_log.read_bytes(), evidence)
        new_runs = set(logs.iterdir()) - first_runs - {unrelated}
        self.assertEqual(len(new_runs), 1)
        self.assertTrue(
            (next(iter(new_runs)) / "current-pr-head/tlc.out").is_file()
        )

    def test_rejects_missing_sensitivity_config(self):
        (self.model / "NoSafeWait.cfg").unlink()
        self.assert_rejected()

    def test_rejects_invalid_sensitivity_config(self):
        (self.model / "NoSafeWait.cfg").write_text("CONSTANTS =\n")
        self.assert_rejected()

    def test_rejects_sensitivity_spec_parser_failure(self):
        (self.model / "Broken.tla").write_text(
            "---- MODULE Broken ----\nInvalid == (\n====\n"
        )
        self.use_failing_java(
            'exec "$REAL_JAVA_BIN" -cp "$TLC_JAR" tlc2.TLC '
            '-config NoSafeWait.cfg Broken\n'
        )
        self.assert_rejected()

    def test_rejects_unrelated_invariant_violation(self):
        shutil.copyfile(self.model / "NoSessionGate.cfg", self.model / "NoSafeWait.cfg")
        self.assert_rejected()

    def test_rejects_sensitivity_that_passes(self):
        shutil.copyfile(self.model / "Hardened.cfg", self.model / "NoSafeWait.cfg")
        self.assert_rejected()

    def test_rejects_jvm_failure_after_current_model_passes(self):
        self.use_failing_java(
            'echo "Error: Could not create the Java Virtual Machine." >&2\n'
            'exit 1\n'
        )
        self.assert_rejected()

    def test_rejects_invariant_text_without_safety_violation_exit(self):
        self.use_failing_java(
            'echo "Error: Invariant PendingSafeCheckNeverSubmits is violated."\n'
            'exit 1\n'
        )
        self.assert_rejected()


if __name__ == "__main__":
    unittest.main()
