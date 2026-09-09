#!/bin/bash
# Phase 1: curl smoke test of all routes with session cookie. Catches SSR 500s.
cd /home/z/my-project
COOKIE=$(cat scripts/cookie-string.txt)
ROUTES=$(find src/app -name "page.tsx" | sed 's|src/app||; s|/page.tsx||; s|^$|/|' | sort)
REPORT=scripts/e2e-curl-report.txt
: > "$REPORT"
PASS=0; FAIL=0; FAILED=""
for r in $ROUTES; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE" "http://localhost:3000$r" --max-time 90)
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
    echo "OK   $code $r" >> "$REPORT"; PASS=$((PASS+1))
  else
    echo "FAIL $code $r" >> "$REPORT"; FAIL=$((FAIL+1)); FAILED="$FAILED $r($code)"
  fi
  sleep 2.5
done
echo "" >> "$REPORT"
echo "SUMMARY: PASS=$PASS FAIL=$FAIL" >> "$REPORT"
[ -n "$FAILED" ] && echo "FAILED:$FAILED" >> "$REPORT"
tail -3 "$REPORT"
