// =====================================================================
// MODULE RESOLVER — resolves which modules are enabled for a tenant
// and whether their dependencies are met.
// =====================================================================

import { db } from "@/lib/db";
import { MODULE_MAP, MODULE_CATALOG } from "./catalog";
import type { CryptskModule, ResolvedModuleState, NavigationItem } from "./types";

/**
 * Returns the persisted state of every module for a tenant.
 * Falls back to `defaultEnabled` when no persisted state exists.
 */
export async function resolveModuleStates(
  tenantId: string
): Promise<ResolvedModuleState[]> {
  const persisted = await db.moduleState.findMany({
    where: { tenantId },
  });

  const persistedMap = new Map(persisted.map((p) => [p.moduleId, p]));

  return MODULE_CATALOG.map((mod): ResolvedModuleState => {
    const state = persistedMap.get(mod.id);
    const enabled = mod.coreModule
      ? true
      : state?.enabled ?? mod.defaultEnabled;
    const licensed = state?.licensed ?? true; // sandbox: assume licensed
    const dependenciesMet = (mod.dependencies ?? []).every((depId) => {
      const depState = persistedMap.get(depId);
      const depModule = MODULE_MAP[depId];
      if (!depModule) return false;
      return depModule.coreModule
        ? true
        : depState?.enabled ?? depModule.defaultEnabled;
    });

    return {
      module: mod,
      enabled: enabled && dependenciesMet,
      licensed,
      health: state?.health ?? "unknown",
      workerStatus: state?.workerStatus ?? "stopped",
      dependenciesMet,
    };
  });
}

/**
 * Returns only the modules that are currently enabled for a tenant.
 */
export async function getEnabledModules(
  tenantId: string
): Promise<CryptskModule[]> {
  const states = await resolveModuleStates(tenantId);
  return states.filter((s) => s.enabled).map((s) => s.module);
}

/**
 * Is a specific module enabled for a tenant?
 */
export async function isModuleEnabled(
  tenantId: string,
  moduleId: string
): Promise<boolean> {
  const states = await resolveModuleStates(tenantId);
  const state = states.find((s) => s.module.id === moduleId);
  return !!state?.enabled;
}

/**
 * Builds the navigation tree for a tenant from the module registry.
 * Groups are ordered by catalog order. Core module always first.
 */
export async function buildNavigation(
  tenantId: string
): Promise<NavigationItem[]> {
  const enabledModules = await getEnabledModules(tenantId);
  const items: NavigationItem[] = [];

  for (const mod of enabledModules) {
    for (const group of mod.navigation) {
      items.push({
        id: group.id,
        label: group.label,
        icon: group.icon,
        href: group.children[0]?.href ?? "#",
        permission: group.permission,
        children: group.children.map((child) => ({
          id: child.id,
          label: child.label,
          icon: child.icon,
          href: child.href,
          permission: child.permission,
          badgeKey: child.badgeKey,
        })),
      });
    }
  }

  return items;
}

/**
 * Toggle a module's enabled state. Core modules cannot be disabled.
 * Returns the updated state. Enabling a module auto-enables its deps.
 */
export async function toggleModule(
  tenantId: string,
  moduleId: string,
  enabled: boolean
): Promise<ResolvedModuleState> {
  const mod = MODULE_MAP[moduleId];
  if (!mod) {
    throw new Error(`Unknown module: ${moduleId}`);
  }
  if (mod.coreModule && !enabled) {
    throw new Error(`Core module ${moduleId} cannot be disabled`);
  }

  // When enabling, auto-enable missing dependencies
  if (enabled && mod.dependencies?.length) {
    for (const depId of mod.dependencies) {
      const depModule = MODULE_MAP[depId];
      if (!depModule || depModule.coreModule) continue;
      await db.moduleState.upsert({
        where: {
          tenantId_moduleId: { tenantId, moduleId: depId },
        },
        update: { enabled: true },
        create: {
          tenantId,
          moduleId: depId,
          enabled: true,
          licensed: true,
        },
      });
    }
  }

  const updated = await db.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId, moduleId } },
    update: { enabled },
    create: {
      tenantId,
      moduleId,
      enabled,
      licensed: true,
    },
  });

  return {
    module: mod,
    enabled: updated.enabled,
    licensed: updated.licensed,
    health: updated.health,
    workerStatus: updated.workerStatus,
    dependenciesMet: (mod.dependencies ?? []).every((depId) => {
      const depModule = MODULE_MAP[depId];
      return depModule?.coreModule ?? false;
    }) || enabled === false,
  };
}
