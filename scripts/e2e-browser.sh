#!/bin/bash
# Phase 2: browser E2E — visit every page, catch client-side JS errors.
# Restarts next-server every 10 pages (OOM guard). Re-logins if session lost.
cd /home/z/my-project
ROUTES=$(find src/app -name "page.tsx" | sed 's|src/app||; s|/page.tsx||; s|^$|/|' | sort)
REPORT=scripts/e2e-browser-report.txt
: > "$REPORT"
PASS=0; FAIL=0; FAILED=""; COUNT=0

restart_server() {
  echo "--- server restart at page #$COUNT ---" >> "$REPORT"
  start-stop-daemon --stop --pidfile /tmp/nextdev.pid --retry 5 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  sleep 2
  rm -f /tmp/nextdev.pid
  NODE_OPTIONS=--max-old-space-size=1024 NEXT_TELEMETRY_DISABLED=1 start-stop-daemon --start --background --make-pidfile --pidfile /tmp/nextdev.pid --chdir /home/z/my-project --exec /usr/local/bin/bun -- run dev
  for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login --max-time 5 2>/dev/null)
    if [ "$code" = "200" ]; then break; fi
    sleep 2
  done
}

ensure_logged_in() {
  agent-browser open "http://localhost:3000/" >/dev/null 2>&1
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
  local u=$(agent-browser get url 2>/dev/null | grep -v "^✓" | head -1)
  if [[ "$u" == *"/login"* ]]; then
    agent-browser find role button click --name "Sign in" >/dev/null 2>&1
    agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
    agent-browser errors --clear >/dev/null 2>&1
  fi
}

ensure_logged_in

for r in $ROUTES; do
  if [ $((COUNT % 10)) -eq 0 ] && [ $COUNT -gt 0 ]; then
    restart_server
    ensure_logged_in
  fi
  COUNT=$((COUNT+1))
  agent-browser open "http://localhost:3000$r" >/dev/null 2>&1
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
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

echo "" >> "$REPORT"
echo "SUMMARY: PASS=$PASS FAIL=$FAIL of $COUNT" >> "$REPORT"
[ -n "$FAILED" ] && echo "FAILED:$FAILED" >> "$REPORT"
tail -4 "$REPORT"
