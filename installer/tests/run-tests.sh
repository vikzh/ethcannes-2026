#!/usr/bin/env bash
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_TESTS=()

printf "Running installer test suite...\n\n"

for test_file in "${TESTS_DIR}"/test_*.sh; do
  test_name="$(basename "$test_file")"
  printf '%s\n' "--- ${test_name} ---"

  set +e
  output=$(bash "$test_file" 2>&1)
  rc=$?
  set -e

  echo "$output"

  # Parse pass/fail counts from output (last line format: "N/M tests passed")
  pass=$(echo "$output" | grep -oE "^[0-9]+" | tail -1)
  total=$(echo "$output" | grep -oE "/[0-9]+ tests" | grep -oE "[0-9]+" | tail -1)

  if [[ -n "$pass" ]] && [[ -n "$total" ]]; then
    fail=$((total - pass))
    TOTAL_PASS=$((TOTAL_PASS + pass))
    TOTAL_FAIL=$((TOTAL_FAIL + fail))
  fi

  if [[ $rc -ne 0 ]]; then
    FAILED_TESTS+=("$test_name")
  fi
  printf "\n"
done

# Summary
TOTAL=$((TOTAL_PASS + TOTAL_FAIL))
printf "=== Test Suite Summary ===\n"
printf "%d/%d tests passed" "$TOTAL_PASS" "$TOTAL"
if [[ $TOTAL_FAIL -gt 0 ]]; then
  printf ", %d failed" "$TOTAL_FAIL"
fi
printf "\n"

if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
  printf "\nFailed test files:\n"
  for t in "${FAILED_TESTS[@]}"; do
    printf "  - %s\n" "$t"
  done
  exit 1
fi

exit 0
