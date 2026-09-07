// =====================================================================
// ICON — stable wrapper component that resolves an icon by name.
// Uses createElement to avoid the "component created during render" rule:
// the ICON_MAP is defined at module level, so references are stable.
// =====================================================================

import { createElement } from "react";
import { resolveIcon } from "./icon-resolver";
import { cn } from "@/lib/utils";

interface IconProps {
  name: string;
  className?: string;
}

export function Icon({ name, className }: IconProps) {
  return createElement(resolveIcon(name), { className: cn(className) });
}
