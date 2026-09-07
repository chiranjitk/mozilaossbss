// =====================================================================
// SIDEBAR — Module Registry-driven navigation
// Dark enterprise sidebar. Brand red accent on active items.
// Collapsible on mobile. Permission-filtered on the client side, but
// the backend ALWAYS re-checks permissions on every request.
// =====================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { NavigationItem } from "@/core/modules/types";

interface SidebarProps {
  navigation: NavigationItem[];
  permissions: string[];
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  navigation,
  permissions,
  mobileOpen,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();

  // Filter navigation by permission on the client
  const filteredNav = navigation
    .map((group) => ({
      ...group,
      children: group.children?.filter(
        (child) => !child.permission || permissions.includes(child.permission) || permissions.includes("*")
      ),
    }))
    .filter((group) => !group.permission || permissions.includes(group.permission) || permissions.includes("*"))
    .filter((group) => (group.children?.length ?? 0) > 0);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <Link href="/" className="flex items-center gap-2" onClick={onClose}>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <span className="text-sm font-bold">C</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Cryptsk</span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                OSS/BSS
              </span>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-3.5rem-2.5rem)]">
          <nav className="flex flex-col gap-0.5 p-2">
            {filteredNav.map((group) => (
              <NavGroup
                key={group.id}
                group={group}
                pathname={pathname}
                onItemClick={onClose}
              />
            ))}
          </nav>
        </ScrollArea>
      </aside>
    </>
  );
}

function NavGroup({
  group,
  pathname,
  onItemClick,
}: {
  group: NavigationItem;
  pathname: string;
  onItemClick: () => void;
}) {
  const hasChildren = (group.children?.length ?? 0) > 0;
  const isChildActive = group.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
  const [open, setOpen] = useState(true);

  if (!hasChildren) {
    return (
      <Link
        href={group.href}
        onClick={onItemClick}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isChildActive && "bg-brand text-brand-foreground hover:bg-brand hover:text-brand-foreground"
        )}
      >
        <Icon name={group.icon} className="h-4 w-4 shrink-0" />
        <span className="truncate">{group.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isChildActive && "text-brand"
        )}
      >
        <Icon name={group.icon} className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50" />
        )}
      </button>
      {open && (
        <div className="ml-4 border-l border-sidebar-border pl-2">
          {group.children!.map((child) => {
            const active = pathname === child.href || pathname.startsWith(child.href + "/");
            return (
              <Link
                key={child.id}
                href={child.href}
                onClick={onItemClick}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active
                    ? "bg-brand/15 text-brand font-medium"
                    : "text-sidebar-foreground/75"
                )}
              >
                <Icon name={child.icon} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
