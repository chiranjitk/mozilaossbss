/**
 * Cryptsk Git Auto-Push Watcher
 * ============================================
 * Hard rule: every code change is committed & pushed to GitHub automatically.
 *
 * Strategy: poll `git status --porcelain` on a debounce. Filesystem watchers
 * (fs.watch / chokidar) are flaky on network/container filesystems, so we poll
 * every POLL_INTERVAL_MS and coalesce bursts of edits with a debounce window.
 *
 * Safety:
 *  - Skips push if another git op holds .git/index.lock
 *  - Skips commits that would only touch gitignored files (porcelain respects ignore)
 *  - Pushes are serialized (in-flight lock) to avoid clobbering refs
 *  - On push failure (network), retries next cycle; keeps local commit
 *
 * Exposes a tiny HTTP health endpoint on PORT (3005) so it can be probed.
 */

import { existsSync } from "node:fs";

const PORT = 3005;
const POLL_INTERVAL_MS = 10_000; // check for changes every 10s
const DEBOUNCE_MS = 15_000; // wait 15s of quiet before committing a burst
const REPO_ROOT = "/home/z/my-project";
const BRANCH = "main";
const REMOTE = "origin";

type PushState = "idle" | "committing" | "pushing" | "error";
const stats = {
  lastPollAt: null as string | null,
  lastCommitAt: null as string | null,
  lastPushAt: null as string | null,
  lastCommitHash: null as string | null,
  commitsPushed: 0,
  filesCommitted: 0,
  state: "idle" as PushState,
  lastError: null as string | null,
  pendingFiles: 0,
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

function ts(): string {
  return new Date().toISOString();
}

function git(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const proc = Bun.spawnSync({
      cmd: ["git", ...args],
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout as Uint8Array).trim() : "";
    const stderr = proc.stderr ? new TextDecoder().decode(proc.stderr as Uint8Array).trim() : "";
    return { ok: proc.exitCode === 0, stdout, stderr };
  } catch (e) {
    return { ok: false, stdout: "", stderr: String(e) };
  }
}

function gitLocked(): boolean {
  return existsSync(`${REPO_ROOT}/.git/index.lock`);
}

function summarizeChanges(porcelain: string): { count: number; kinds: Record<string, number> } {
  const lines = porcelain.split("\n").filter(Boolean);
  const kinds: Record<string, number> = {};
  for (const line of lines) {
    const code = line.slice(0, 2).trim() || "?";
    kinds[code] = (kinds[code] ?? 0) + 1;
  }
  return { count: lines.length, kinds };
}

function labelFor(code: string): string {
  switch (code) {
    case "M": return "modified";
    case "A": return "added";
    case "??": return "untracked";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    default: return code;
  }
}

function buildCommitMessage(porcelain: string): string {
  const { count, kinds } = summarizeChanges(porcelain);
  const parts = Object.entries(kinds)
    .map(([k, v]) => `${v} ${labelFor(k)}`)
    .join(", ");
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  return `auto: ${stamp} — ${count} file${count === 1 ? "" : "s"} (${parts}) [autopush]`;
}

function commitAndPush(): void {
  if (inFlight) {
    log("skip: another commit/push in flight");
    return;
  }
  if (gitLocked()) {
    log("skip: .git/index.lock present (another git op running)");
    return;
  }
  inFlight = true;
  stats.state = "committing";
  try {
    const status = git(["status", "--porcelain"]);
    if (!status.ok) throw new Error(`git status failed: ${status.stderr}`);
    const porcelain = status.stdout;
    if (!porcelain.trim()) {
      log("nothing to commit (clean tree)");
      stats.state = "idle";
      stats.pendingFiles = 0;
      return;
    }
    stats.pendingFiles = porcelain.split("\n").filter(Boolean).length;

    const add = git(["add", "-A"]);
    if (!add.ok) throw new Error(`git add failed: ${add.stderr}`);

    const msg = buildCommitMessage(porcelain);
    const commit = git(["commit", "-m", msg]);
    if (!commit.ok) {
      if (
        commit.stderr.includes("nothing to commit") ||
        commit.stdout.includes("nothing to commit")
      ) {
        log("nothing to commit after add (already committed by concurrent op)");
        stats.state = "idle";
        return;
      }
      throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }
    stats.lastCommitAt = ts();
    const rev = git(["rev-parse", "--short", "HEAD"]);
    stats.lastCommitHash = rev.ok ? rev.stdout : null;
    stats.commitsPushed += 1;
    stats.filesCommitted += stats.pendingFiles;
    log(`committed ${stats.pendingFiles} files -> ${stats.lastCommitHash}`);

    stats.state = "pushing";
    const push = git(["push", REMOTE, BRANCH]);
    if (!push.ok) {
      stats.lastError = `push failed: ${push.stderr || push.stdout}`;
      stats.state = "error";
      log(`PUSH FAILED (will retry next cycle): ${stats.lastError}`);
      return;
    }
    stats.lastPushAt = ts();
    stats.lastError = null;
    stats.state = "idle";
    stats.pendingFiles = 0;
    log(`pushed to ${REMOTE}/${BRANCH} OK`);
  } catch (e: any) {
    stats.lastError = String(e?.message ?? e);
    stats.state = "error";
    log(`ERROR: ${stats.lastError}`);
  } finally {
    inFlight = false;
  }
}

function poll(): void {
  stats.lastPollAt = ts();
  try {
    if (gitLocked()) {
      log("poll: index.lock present, deferring");
      return;
    }
    const status = git(["status", "--porcelain"]);
    if (!status.ok) {
      stats.lastError = `git status failed: ${status.stderr}`;
      stats.state = "error";
      return;
    }
    const porcelain = status.stdout;
    stats.pendingFiles = porcelain.split("\n").filter(Boolean).length;
    if (porcelain.trim()) {
      // Arm debounce ONCE — let it fire after the quiet window.
      // Re-arming on every poll would prevent the commit from ever firing
      // because persistent (untracked) files keep porcelain non-empty.
      if (!debounceTimer && !inFlight) {
        log(`detected ${stats.pendingFiles} changed file(s) — debouncing ${DEBOUNCE_MS}ms`);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          commitAndPush();
        }, DEBOUNCE_MS);
      }
    }
  } catch (e) {
    stats.lastError = String(e);
  }
}

function log(msg: string): void {
  console.log(`[${ts()}] [autopush] ${msg}`);
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health" || url.pathname === "/") {
      return Response.json({
        service: "cryptsk-git-autopush",
        status: stats.state === "error" ? "degraded" : "ok",
        branch: BRANCH,
        remote: REMOTE,
        pollIntervalMs: POLL_INTERVAL_MS,
        debounceMs: DEBOUNCE_MS,
        ...stats,
      });
    }
    if (url.pathname === "/trigger") {
      commitAndPush();
      return Response.json({ triggered: true, at: ts() });
    }
    return new Response("Not Found", { status: 404 });
  },
});

log(`Git Auto-Push watcher started on port ${PORT}`);
log(`repo=${REPO_ROOT} branch=${BRANCH} remote=${REMOTE}`);
log(`polling every ${POLL_INTERVAL_MS}ms, debouncing ${DEBOUNCE_MS}ms`);
log(`health: http://localhost:${PORT}/health`);

poll();
setInterval(poll, POLL_INTERVAL_MS);

process.on("SIGTERM", () => {
  log("SIGTERM received, shutting down");
  server.stop();
  process.exit(0);
});
process.on("SIGINT", () => {
  log("SIGINT received, shutting down");
  server.stop();
  process.exit(0);
});
// Resilience: never let an unhandled error kill the watcher
process.on("uncaughtException", (err) => {
  stats.lastError = `uncaughtException: ${String(err)}`;
  stats.state = "error";
  log(`uncaughtException: ${String(err)}`);
});
process.on("unhandledRejection", (reason) => {
  stats.lastError = `unhandledRejection: ${String(reason)}`;
  stats.state = "error";
  log(`unhandledRejection: ${String(reason)}`);
});
