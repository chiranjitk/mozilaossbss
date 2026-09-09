#!/bin/bash
# Continuation: browser E2E for remaining routes
cd /home/z/my-project
REPORT=scripts/e2e-browser-report.txt
ROUTES="/policy/bandwidth /policy/firewall /policy/qos /policy/time-access /subscribers /subscribers/batch"
PASS=0; FAIL=0; FAILED=""
for r in $ROUTES; do
  agent-browser open "http://localhost:3000$r" >/dev/null 2>&1
  agent-browser wait --load networkidle --timeout 25000 >/dev/null 2>&1
  sleep 0.5
  errs=$(agent-browser errors 2>/dev/null | grep -v "^✓" | grep -vi "no page errors" | head -4)
  final_url=$(agent-browser get url 2>/dev/null | grep -v "^✓" | head -1)
  if [ -n "$errs" ]; then
    echo "FAIL $r | url=$final_url" >> "$REPORT"
    echo "$errs" >> "$REPORT"
    FAIL=$((FAIL+1)); FAILED="$FAILED $r"
  else
    echo "OK   $r | url=$final_url" >> "$REPORT"
    PASS=$((PASS+1))
  fi
  agent-browser errors --clear >/dev/null 2>&1
  agent-browser console --clear >/dev/null 2>&1
done
echo "CONTINUATION: PASS=$PASS FAIL=$FAIL" >> "$REPORT"
echo "remaining-failed: $FAILED"
