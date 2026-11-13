#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="$ROOT/formal/pr-1694-renewal"
OUT_ROOT="${FORMAL_OUT_DIR:-${TMPDIR:-/tmp}/apps-monorepo-pr-1694-formal}"
mkdir -p "$OUT_ROOT"
OUT_DIR="$(mktemp -d "$OUT_ROOT/run.XXXXXXXX")"
TLC_TOOL='http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4'
JAVA_TOOL='java@temurin-25'

if [[ -z "${TLC_JAR:-}" || -z "${JAVA_BIN:-}" ]]; then
  if ! command -v mise >/dev/null 2>&1; then
    echo 'PR #1694 formal verification needs mise or TLC_JAR and JAVA_BIN' >&2
    exit 2
  fi
  mise install "$JAVA_TOOL" "$TLC_TOOL" >/dev/null
  TLC_JAR="${TLC_JAR:-$(mise where "$TLC_TOOL")/tla2tools.jar}"
  JAVA_BIN="${JAVA_BIN:-$(mise which java --tool "$JAVA_TOOL")}"
fi

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
      -config "$config" -metadir "$log_dir/meta" RenewalConsent
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

run_expected current-pr-head Current.cfg UnlimitedApprovalIsDisclosed
run_expected hardened Hardened.cfg pass
run_expected without-fresh-consent NoConsent.cfg NoUnconsentedIncrease
run_expected canceled-attempt-signs NoCancel.cfg CancelNeverSigns
run_expected stale-attempt-owns-prompt AcceptStale.cfg CurrentAttemptOwnsPrompt
run_expected without-unlimited-disclosure NoDisclosure.cfg UnlimitedApprovalIsDisclosed
run_expected live-quote-replaces-prompt LiveQuoteReplacesPrompt.cfg PromptReceiptRemainsVisible
run_expected token-permit-is-ignored IgnoreTokenPermit.cfg ApprovalStepMatchesEitherCoin

echo "PR #1694 model sensitivity passed. TLC logs: $OUT_DIR"
