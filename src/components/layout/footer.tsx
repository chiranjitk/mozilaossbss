// =====================================================================
// FOOTER — sticky to bottom, pushed down naturally on long pages
// =====================================================================

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background py-3 px-4">
      <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Cryptsk</span>
          <span className="text-muted-foreground/70">·</span>
          <span>OSS/BSS &amp; AAA Access Gateway</span>
        </div>
        <div className="flex items-center gap-3">
          <span>v1.0.0-dev</span>
          <span className="text-muted-foreground/70">·</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
