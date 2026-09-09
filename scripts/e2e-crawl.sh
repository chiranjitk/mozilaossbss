#!/bin/bash
# Full UI E2E crawl for Cryptsk — visits every page, checks for JS errors & error boundaries.
cd /home/z/my-project
ROUTES=$(find src/app -name "page.tsx" | sed 's|src/app||; s|/page.tsx||; s|^$|/|' | sort)
REPORT=/home/z/my-project/scripts/e2e-report.txt
: > "$REPORT"
PASS=0; FAIL=0; FAILED_ROUTES=""

for r in $ROUTES; do
  url="http://localhost:3000$r"
  agent-browser open "$url" >/dev/null 2>&1
  agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
  sleep 0.4
  errs=$(agent-browser errors 2>/dev/null | grep -v "^✓" | grep -vi "no page errors" | head -5)
  crash=$(agent-browser eval "document.body ? (document.body.innerText.match(/Application error|Internal Server Error|Something went wrong|Error: /i) ? 'CRASH_TEXT' : 'OK') : 'NO_BODY'" 2>/dev/null | grep -v "^✓" | head -1)
  final_url=$(agent-browser get url 2>/dev/null | grep -v "^✓" | head -1)
  status_line="ROUTE $r | url=$final_url | dom=$crash"
  if [ -n "$errs" ]; then
    status_line="$status_line | JS_ERRORS:"
    echo "$status_line" >> "$REPORT"
    echo "$errs" >> "$REPORT"
    FAIL=$((FAIL+1)); FAILED_ROUTES="$FAILED_ROUTES $r"
  elif [ "$crash" != "OK" ]; then
    echo "$status_line" >> "$REPORT"
    FAIL=$((FAIL+1)); FAILED_ROUTES="$FAILED_ROUTES $r"
  else
    echo "$status_line" >> "$REPORT"
    PASS=$((PASS+1))
  fi
  agent-browser errors --clear >/dev/null 2>&1
  agent-browser console --clear >/dev/null 2>&1
done

echo "" >> "$REPORT"
echo "SUMMARY: PASS=$PASS FAIL=$FAIL" >> "$REPORT"
echo "FAILED:$FAILED_ROUTES" >> "$REPORT"
tail -5 "$REPORT"
