#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_ROOT="${FORMAL_OUT_DIR:-${TMPDIR:-/tmp}/manager-migration-formal}"
TLC_TOOL='http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4'
JAVA_TOOL='java@temurin-25'

node "$HERE/verify-source-map.mjs"

if [[ -z "${TLC_JAR:-}" || -z "${JAVA_BIN:-}" ]]; then
  if ! command -v mise >/dev/null 2>&1; then
    echo 'Migration sensitivity verification needs mise or TLC_JAR and JAVA_BIN.' >&2
    exit 2
  fi
  mise install "$JAVA_TOOL" "$TLC_TOOL" >/dev/null
  TLC_JAR="${TLC_JAR:-$(mise where "$TLC_TOOL")/tla2tools.jar}"
  JAVA_BIN="${JAVA_BIN:-$(mise which java --tool "$JAVA_TOOL")}"
fi

mkdir -p "$OUT_ROOT"
OUT_DIR="$(mktemp -d "$OUT_ROOT/sensitivity.XXXXXXXX")"

run_tlc() {
  local config="$1"
  local label="$2"
  local log_dir="$OUT_DIR/$label"
  local status
  mkdir -p "$log_dir/meta"
  (
    cd "$HERE"
    "$JAVA_BIN" -XX:+UseParallelGC -Djava.io.tmpdir="$log_dir" \
      -cp "$TLC_JAR" tlc2.TLC -workers 1 -fp 0 \
      -config "$config" -metadir "$log_dir/meta" Model
  ) >"$log_dir/tlc.out" 2>&1
  status=$?
  return "$status"
}

expect_pass() {
  local config="$1"
  local label="$2"
  if ! run_tlc "$config" "$label"; then
    echo "$config should pass. See $OUT_DIR/$label/tlc.out." >&2
    tail -60 "$OUT_DIR/$label/tlc.out" >&2
    exit 1
  fi
  echo "PASS: $config"
}

expect_violation() {
  local config="$1"
  local invariant="$2"
  local label="$3"
  local status
  set +e
  run_tlc "$config" "$label"
  status=$?
  set -e
  if [[ $status -ne 12 ]] ||
    ! grep -Eq "^Error: Invariant $invariant is violated(\\.| by the initial state:)$" "$OUT_DIR/$label/tlc.out"; then
    echo "$config should violate only the expected safety property $invariant." >&2
    echo "TLC exit code was $status. See $OUT_DIR/$label/tlc.out." >&2
    tail -60 "$OUT_DIR/$label/tlc.out" >&2
    exit 1
  fi
  echo "PASS: $config detects $invariant"
}

set +e
run_tlc Current.cfg current
current_status=$?
set -e
if [[ $current_status -ne 12 ]] ||
  ! grep -Eq '^Error: Invariant .+ is violated\.$' "$OUT_DIR/current/tlc.out"; then
  echo "Current.cfg should produce a safety counterexample with TLC exit code 12." >&2
  tail -60 "$OUT_DIR/current/tlc.out" >&2
  exit 1
fi
echo 'PASS: Current.cfg exposes a current-code counterexample'

expect_pass Hardened.cfg hardened
expect_pass Contract.cfg contract

while IFS=$'\t' read -r config behaviour guard invariant; do
  if [[ "$config" == 'config' ]]; then
    continue
  fi
  expect_violation "$config" "$invariant" "$behaviour-$guard"
done <"$HERE/sensitivity.tsv"

echo "Migration sensitivity passed. TLC logs: $OUT_DIR"
