#!/bin/bash
# Resume chunked e2e: skip files already recorded in /tmp/e2e-chunked.log,
# wrap every invocation in GNU timeout (25 min) so a wedged WebKit driver
# cannot stall the loop forever.
cd /c/brave-davinci || exit 1
OUT=/tmp/e2e-chunked2.log
touch "$OUT"
specs=$(ls e2e/*.spec.ts | sort)
total=$(echo "$specs" | wc -l)
i=0
fails=""
for spec in $specs; do
  i=$((i+1))
  name=$(basename "$spec")
  if grep -qE "^(PASS|FAIL) $name$" /tmp/e2e-chunked2.log; then
    echo "=== [$i/$total] SKIP $name (already recorded) ===" >> "$OUT"
    continue
  fi
  echo "=== [$i/$total] $name $(date +%H:%M:%S) ===" >> "$OUT"
  timeout -k 30 1500 npx playwright test "$spec" >> "$OUT" 2>&1
  rc=$?
  if [ $rc -eq 124 ] || [ $rc -eq 137 ]; then
    echo "--- TIMEOUT-WEDGE $name, retry with fresh backend ---" >> "$OUT"
    timeout -k 30 1500 npx playwright test "$spec" >> "$OUT" 2>&1
    rc=$?
  fi
  if [ $rc -ne 0 ] && ! grep -qE "^(PASS|FAIL) $name$" /tmp/e2e-chunked.log; then
    echo "--- retry $name (fresh backend) ---" >> "$OUT"
    timeout -k 30 1500 npx playwright test "$spec" >> "$OUT" 2>&1
    rc=$?
  fi
  if [ $rc -ne 0 ]; then
    fails="$fails $name"
    echo "FAIL $name" >> "$OUT"
  else
    echo "PASS $name" >> "$OUT"
  fi
done
echo "===== SUMMARY =====" >> "$OUT"
if [ -z "$fails" ]; then echo "ALL REMAINING SPEC FILES GREEN" >> "$OUT"; else echo "FAILED FILES:$fails" >> "$OUT"; fi
echo "DONE $(date +%H:%M:%S)" >> "$OUT"
