#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="$ROOT/apps/manager/verification/migration"
OUT_ROOT="${FORMAL_OUT_DIR:-${TMPDIR:-/tmp}/manager-migration-formal}"
TLC_TOOL='http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4'
JAVA_TOOL='java@temurin-25'

if [[ -z "${TLC_JAR:-}" || -z "${JAVA_BIN:-}" ]]; then
  if ! command -v mise >/dev/null 2>&1; then
    echo 'Migration verification needs mise or TLC_JAR and JAVA_BIN.' >&2
    exit 2
  fi
  mise install "$JAVA_TOOL" "$TLC_TOOL" >/dev/null
  TLC_JAR="${TLC_JAR:-$(mise where "$TLC_TOOL")/tla2tools.jar}"
  JAVA_BIN="${JAVA_BIN:-$(mise which java --tool "$JAVA_TOOL")}"
fi

mkdir -p "$OUT_ROOT"
OUT_DIR="$(mktemp -d "$OUT_ROOT/run.XXXXXXXX")"
mkdir -p "$OUT_DIR/configs" "$OUT_DIR/vitest"

node "$MODEL_DIR/verify-source-map.mjs"

run_tlc() {
  local config="$1"
  local label="$2"
  local log_dir="$OUT_DIR/$label"
  local status
  mkdir -p "$log_dir/meta"
  (
    cd "$MODEL_DIR"
    "$JAVA_BIN" -XX:+UseParallelGC -Djava.io.tmpdir="$log_dir" \
      -cp "$TLC_JAR" tlc2.TLC -workers 1 -fp 0 \
      -config "$config" -metadir "$log_dir/meta" Model
  ) >"$log_dir/tlc.out" 2>&1
  status=$?
  return "$status"
}

expect_current_result() {
  local behaviour="$1"
  local invariant="$2"
  local expected="$3"
  local config="$OUT_DIR/configs/Current-$behaviour.cfg"
  local status

  awk '!/^INVARIANT / && !/^CHECK_DEADLOCK /' "$MODEL_DIR/Current.cfg" >"$config"
  printf '\nINVARIANT TypeOK\nINVARIANT %s\n\nCHECK_DEADLOCK FALSE\n' "$invariant" >>"$config"

  set +e
  run_tlc "$config" "current-$behaviour"
  status=$?
  set -e

  if [[ "$expected" == 'hold' ]]; then
    if [[ $status -ne 0 ]]; then
      echo "$behaviour should hold $invariant on Current.cfg." >&2
      tail -60 "$OUT_DIR/current-$behaviour/tlc.out" >&2
      exit 1
    fi
    echo "HOLD: $behaviour $invariant"
    return
  fi

  if [[ $status -ne 12 ]] ||
    ! grep -Eq "^Error: Invariant $invariant is violated(\\.| by the initial state:)$" "$OUT_DIR/current-$behaviour/tlc.out"; then
    echo "$behaviour should violate $invariant with TLC exit code 12." >&2
    echo "TLC exit code was $status. See $OUT_DIR/current-$behaviour/tlc.out." >&2
    tail -60 "$OUT_DIR/current-$behaviour/tlc.out" >&2
    exit 1
  fi
  echo "VIOLATED: $behaviour $invariant"
}

set +e
run_tlc Current.cfg current-all
current_status=$?
set -e
if [[ $current_status -ne 12 ]]; then
  echo "Current.cfg should fail with TLC exit code 12. See $OUT_DIR/current-all/tlc.out." >&2
  exit 1
fi

echo 'Checking every migration promise against the current source mapping.'
while IFS=$'\t' read -r behaviour invariant expected; do
  if [[ "$behaviour" == 'behaviour' ]]; then
    continue
  fi
  expect_current_result "$behaviour" "$invariant" "$expected"
done <"$MODEL_DIR/current-expectations.tsv"

FORMAL_OUT_DIR="$OUT_DIR/sensitivity-runs" \
TLC_JAR="$TLC_JAR" \
JAVA_BIN="$JAVA_BIN" \
  "$MODEL_DIR/verify-sensitivity.sh"

(
  cd "$ROOT/apps/manager"
  pnpm exec vitest run --maxWorkers=4 verification/migration/real-code-matrix.test.ts
) >"$OUT_DIR/vitest/real-code-matrix.log" 2>&1

echo 'PASS: exhaustive real-code matrices'

expect_regression_failure() {
  local file="$1"
  local test_name="$2"
  local label="$3"
  local log="$OUT_DIR/vitest/$label.log"
  local status
  set +e
  (
    cd "$ROOT/apps/manager"
    pnpm exec vitest run --maxWorkers=4 "$file" -t "$test_name"
  ) >"$log" 2>&1
  status=$?
  set -e
  if [[ $status -eq 0 ]] || ! grep -F "$test_name" "$log" >/dev/null; then
    echo "Expected regression witness to fail: $test_name. See $log." >&2
    tail -80 "$log" >&2
    exit 1
  fi
  echo "EXPECTED RED: $test_name"
}

expect_regression_failure \
  src/features/migration/service/migrationService.test.ts \
  'allows only one same-scope execution to reach wallet submission' \
  same-scope-execution
expect_regression_failure \
  src/features/migration/service/migrationService.test.ts \
  'keeps retry operations when equivalent classifications were rehydrated' \
  retry-rehydration
expect_regression_failure \
  src/features/migration/service/migrationService.test.ts \
  'keeps a journaled hash locked when its receipt is unavailable' \
  pending-receipt
expect_regression_failure \
  src/features/migration/hooks/useMigrationRecoverySnapshot.test.ts \
  'does not delete a newer snapshot while discarding an unused snapshot' \
  stale-recovery-cleanup
expect_regression_failure \
  src/features/migration/state/migrationUi.machine.test.ts \
  'reports completed and remaining names as partial-success without the success animation' \
  partial-success-outcome
expect_regression_failure \
  verification/migration/partial-success-refresh.test.tsx \
  'refreshes every successful side effect when completed names remain after failure' \
  partial-success-refresh
expect_regression_failure \
  src/features/migration/service/migrationService.test.ts \
  'simulates setup and every planned batch in one chain before the first wallet prompt' \
  chained-plan-simulation

echo "Migration verification passed. Logs: $OUT_DIR"
