#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${FORMAL_OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/registration-payment-sensitivity.XXXXXX")}"
TLC_TOOL='http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4'
JAVA_TOOL='java@temurin-25'

node "$HERE/verify-source-map.mjs"

if ! command -v mise >/dev/null 2>&1; then
  echo 'registration payment sensitivity verification needs mise' >&2
  exit 2
fi

mise install "$JAVA_TOOL" "$TLC_TOOL" >/dev/null
TLC_JAR="$(mise where "$TLC_TOOL")/tla2tools.jar"
JAVA_BIN="$(mise which java --tool "$JAVA_TOOL")"
mkdir -p "$OUT_DIR"

run_tlc() {
  local config="$1"
  local log="$2"
  local metadir="$OUT_DIR/states-${config%.cfg}"
  mkdir -p "$metadir"
  set +e
  (
    cd "$HERE"
    "$JAVA_BIN" \
      -XX:+UseParallelGC \
      -cp "$TLC_JAR" \
      tlc2.TLC \
      -workers 1 \
      -fp 0 \
      -metadir "$metadir" \
      -config "$config" \
      RegistrationPayment
  ) >"$log" 2>&1
  local status=$?
  set -e
  return "$status"
}

expect_pass() {
  local config="$1"
  local log="$OUT_DIR/${config%.cfg}.log"
  if ! run_tlc "$config" "$log"; then
    echo "Expected $config to pass; see $log" >&2
    exit 1
  fi
  echo "PASS: $config"
}

expect_fail() {
  local config="$1"
  local invariant="$2"
  local log="$OUT_DIR/${config%.cfg}.log"
  if run_tlc "$config" "$log"; then
    echo "Expected $config to violate $invariant; see $log" >&2
    exit 1
  fi
  if ! grep -F "Invariant $invariant is violated" "$log" >/dev/null; then
    echo "Expected $config to violate $invariant; see $log" >&2
    exit 1
  fi
  echo "PASS: $config detects $invariant"
}

expect_fail RegistrationPayment.cfg InFlightViewMatchesClick
expect_pass RegistrationPaymentHardened.cfg
expect_fail RegistrationPaymentNoHold.cfg InFlightViewMatchesClick
expect_fail RegistrationPaymentNoSelectionLock.cfg PendingSelectionIsStable
expect_fail RegistrationPaymentNoActorAbort.cfg ChangedActorNeverStarts
expect_fail RegistrationPaymentNoStartBinding.cfg StartedPaymentMatchesClick

echo "Sensitivity logs: $OUT_DIR"
