// =====================================================================
// MODULE REGISTRY — Types
// The registry is the single source of truth for what Cryptsk can do.
// Navigation, RBAC, workers, and lazy-loaded bundles all derive from this.
// =====================================================================

export type ModuleCategory =
  | "core"
  | "customer"
  | "aaa"
  | "network"
  | "policy"
  | "monitoring"
  | "devices"
  | "services"
  | "operations"
  | "finance"
  | "ai"
  | "communication";

export type ModuleResourceType =
  | "frontend-only"
  | "full-stack"
  | "with-worker"
  | "external-connection"
  | "scheduled-jobs";

export interface ModuleNavChild {
  id: string;
  label: string;
  /** Icon name from lucide-react, resolved in the UI layer */
  icon: string;
  /** Permission key required to view (e.g. "subscriber.read") */
  permission?: string;
  /** href relative to root, e.g. "/subscribers" */
  href: string;
  /** Optional badge counter key (resolved at runtime) */
  badgeKey?: string;
}

export interface ModuleNavGroup {
  id: string;
  label: string;
  icon: string;
  permission?: string;
  children: ModuleNavChild[];
}

export interface CryptskModule {
  id: string;
  name: string;
  description: string;
  version: string;
  category: ModuleCategory;
  /** Industries this module targets; empty = universal */
  industries?: string[];
  /** Modules that must be enabled before this one can be enabled */
  dependencies?: string[];
  /** Permissions this module declares (seeded into the Permission table) */
  permissions: string[];
  /** Resource characteristics for the Module Manager UI */
  resources: ModuleResourceType[];
  /** Whether the module needs a worker process */
  hasWorker: boolean;
  /** Whether the module requires external connection (e.g. RADIUS, SMTP) */
  requiresExternalConnection: boolean;
  /** Default enabled state for new tenants */
  defaultEnabled: boolean;
  /** Whether this module is part of the universal core (cannot be disabled) */
  coreModule: boolean;
  /** Navigation groups contributed by this module */
  navigation: ModuleNavGroup[];
  /** License tier required */
  licenseTier?: "community" | "standard" | "enterprise";
}

export interface ResolvedModuleState {
  module: CryptskModule;
  enabled: boolean;
  licensed: boolean;
  health: string;
  workerStatus: string;
  dependenciesMet: boolean;
}

export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  permission?: string;
  badgeKey?: string;
  children?: NavigationItem[];
}
