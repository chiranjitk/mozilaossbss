#!/usr/bin/env bash
# Auto-restart wrapper for the git-autopush watcher.
# If the watcher ever exits (crash/OOM/etc), this loop respawns it within 3s.
# Logs to /home/z/my-project/dev-autopush.log
cd /home/z/my-project/mini-services/git-autopush
while true; do
  echo "[wrapper $(date -u +%FT%TZ)] starting autopush watcher..." >> /home/z/my-project/dev-autopush.log
  bun index.ts >> /home/z/my-project/dev-autopush.log 2>&1
  EXIT=$?
  echo "[wrapper $(date -u +%FT%TZ)] autopush exited with code $EXIT; respawning in 3s" >> /home/z/my-project/dev-autopush.log
  sleep 3
done
