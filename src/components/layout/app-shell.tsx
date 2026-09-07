// =====================================================================
// APP SHELL — Sidebar + Topbar + Main + Footer
// Wraps every authenticated page. Fetches navigation from the registry.
// =====================================================================

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { Footer } from "./footer";
import { LoadingState } from "@/components/common/states";
import type { NavigationItem } from "@/core/modules/types";

interface AppShellProps {
  navigation: NavigationItem[];
  children: React.ReactNode;
}

export function AppShell({ navigation, children }: AppShellProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading Cryptsk…" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Redirecting to login…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          navigation={navigation}
          permissions={session.user.permissions ?? []}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMobileMenu={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto scroll-thin">
            <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
