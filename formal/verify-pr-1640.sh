#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="$ROOT/formal/pr-1640-safe-renewal"
OUT_ROOT="${FORMAL_OUT_DIR:-${TMPDIR:-/tmp}/apps-monorepo-pr-1640-formal}"
TLC_TOOL='http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4'
JAVA_TOOL='java@temurin-25'

if [[ -z "${TLC_JAR:-}" || -z "${JAVA_BIN:-}" ]]; then
  if ! command -v mise >/dev/null 2>&1; then
    echo 'PR #1640 formal verification needs mise or TLC_JAR and JAVA_BIN' >&2
    exit 2
  fi

  mise install "$JAVA_TOOL" "$TLC_TOOL" >/dev/null
  TLC_JAR="${TLC_JAR:-$(mise where "$TLC_TOOL")/tla2tools.jar}"
  JAVA_BIN="${JAVA_BIN:-$(mise which java --tool "$JAVA_TOOL")}"
fi

mkdir -p "$OUT_ROOT"
OUT_DIR="$(mktemp -d "$OUT_ROOT/run.XXXXXXXX")"

run_expected() {
  local label="$1"
  local config="$2"
  local expected="$3"
  local log_dir="$OUT_DIR/$label"
  local status
  mkdir -p "$log_dir/meta"

  set +e
  (
    cd "$MODEL_DIR"
    "$JAVA_BIN" -XX:+UseParallelGC -Djava.io.tmpdir="$log_dir" \
      -cp "$TLC_JAR" tlc2.TLC -workers 1 -fp 0 -lncheck final \
      -config "$config" -metadir "$log_dir/meta" SafeRenewalRoute
  ) >"$log_dir/tlc.out" 2>&1
  status=$?
  set -e

  if [[ "$expected" == pass && $status -ne 0 ]]; then
    echo "$label should pass but failed" >&2
    tail -60 "$log_dir/tlc.out" >&2
    return 1
  fi
  if [[ "$expected" != pass ]] && {
    [[ $status -ne 12 ]] ||
      ! grep -Eq "^Error: Invariant $expected is violated(\\.| by the initial state:)$" "$log_dir/tlc.out"
  }; then
    echo "$label should violate $expected but exited $status without that counterexample" >&2
    tail -60 "$log_dir/tlc.out" >&2
    return 1
  fi
  echo "$label: $expected"
}

run_expected current-pr-head Current.cfg PendingSafeCheckHidesSessionControls
run_expected hardened Hardened.cfg pass
run_expected wallet-route-requires-hca HcaConnectivityBlocksSafe.cfg ConnectedSafeWalletCanProceed
run_expected pending-session-controls PendingSessionControls.cfg PendingSafeCheckHidesSessionControls
run_expected without-safe-detection-wait NoSafeWait.cfg PendingSafeCheckNeverSubmits
run_expected safe-keeps-base-signer SafeUsesBaseSigner.cfg SafeWithClientUsesWallet
run_expected intent-skips-session-gate NoSessionGate.cfg IntentSubmissionRequiresGate
run_expected intent-skips-l2-bridge NoL2Bridge.cfg L2IntentBridgesBeforeSubmission

echo "PR #1640 model sensitivity passed. TLC logs: $OUT_DIR"
