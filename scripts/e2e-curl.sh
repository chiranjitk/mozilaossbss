#!/bin/bash
# Resilient curl smoke test: restarts Next.js every N routes to avoid OOM (4GB sandbox).
cd /home/z/my-project
COOKIE=$(cat scripts/cookie-string.txt)
ROUTES=$(find src/app -name "page.tsx" | sed 's|src/app||; s|/page.tsx||; s|^$|/|' | sort)
REPORT=scripts/e2e-curl-report.txt
: > "$REPORT"
PASS=0; FAIL=0; FAILED=""; COUNT=0

restart_server() {
  echo "--- restarting next-server (memory guard) at route #$COUNT ---" >> "$REPORT"
  start-stop-daemon --stop --pidfile /tmp/nextdev.pid --retry 5 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  sleep 2
  rm -f /tmp/nextdev.pid
  NODE_OPTIONS=--max-old-space-size=1024 NEXT_TELEMETRY_DISABLED=1 start-stop-daemon --start --background --make-pidfile --pidfile /tmp/nextdev.pid --chdir /home/z/my-project --exec /usr/local/bin/bun -- run dev
  # wait for port 3000
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login --max-time 5 2>/dev/null)
    if [ "$code" = "200" ]; then break; fi
    sleep 2
  done
}

for r in $ROUTES; do
  if [ $((COUNT % 12)) -eq 0 ] && [ $COUNT -gt 0 ]; then
    restart_server
  fi
  COUNT=$((COUNT+1))
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE" "http://localhost:3000$r" --max-time 90)
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
    echo "OK   $code $r" >> "$REPORT"; PASS=$((PASS+1))
  else
    # one retry after fresh restart (transient OOM/compile timeout)
    restart_server
    code2=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE" "http://localhost:3000$r" --max-time 90)
    if [ "$code2" = "200" ] || [ "$code2" = "307" ] || [ "$code2" = "308" ]; then
      echo "OK   $code2 $r (after retry)" >> "$REPORT"; PASS=$((PASS+1))
    else
      echo "FAIL $code -> $code2 $r" >> "$REPORT"; FAIL=$((FAIL+1)); FAILED="$FAILED $r($code/$code2)"
    fi
  fi
  sleep 1
done

echo "" >> "$REPORT"
echo "SUMMARY: PASS=$PASS FAIL=$FAIL of $COUNT" >> "$REPORT"
[ -n "$FAILED" ] && echo "FAILED:$FAILED" >> "$REPORT"
tail -4 "$REPORT"
