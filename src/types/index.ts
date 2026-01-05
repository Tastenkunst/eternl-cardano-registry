/**
 * Shared link structure for social links and websites
 * Used by both project registry and dApp browser entries
 */
export interface Links {
  website?: string;
  documentation?: string;
  x?: string;
  discord?: string;
  reddit?: string;
  telegram?: string;
  github?: string;
  medium?: string;
  forum?: string;
  linkedin?: string;
  youtube?: string;
  facebook?: string;
  linktree?: string;
}

/**
 * Main categories for projects
 */
export type ProjectCategory =
  | 'DEFI'
  | 'MARKETPLACE'
  | 'COLLECTION'
  | 'GAMING'
  | 'COMMUNITY'
  | 'TOKEN_DISTRIBUTION'
  | 'STABLECOIN'
  | 'MOBILE_NETWORK'
  | 'GENERIC'
  | 'SMART_WALLET'
  | 'LAYER_2'
  | 'BLOCKCHAIN'
  | 'NFT_MINTING_PLATFORM'
  | 'UNKNOWN';

/**
 * Sub-categories for projects
 */
export type ProjectSubCategory =
  | 'AMM_DEX'
  | 'ORDERBOOK_DEX'
  | 'HYBRID_DEX'
  | 'CONCENTRATED_LIQUIDITY_DEX'
  | 'LENDING_BORROWING'
  | 'NFT'
  | 'ORACLE'
  | 'WRAPPED_ASSETS'
  | 'DEX'
  | 'DEX_AGGREGATOR'
  | 'CHARITY'
  | 'STAKING'
  | 'PERPETUALS'
  | 'LAUNCHPAD'
  | 'MINING'
  | 'SYNTHETICS'
  | 'OPTION'
  | 'STEALTH_WALLET'
  | 'UNKNOWN';

/**
 * Script purpose types
 */
export type ScriptPurpose =
  | 'SPEND'
  | 'MINT'
  | 'MANAGE'
  | 'WITHDRAW'
  | 'PUBLISH'
  | 'VOTE'
  | 'STAKE'
  | 'SPEND/MINT';

/**
 * Script mappings within a project
 * Maps internal script names to their display names and purposes
 */
export interface ScriptMappings {
  names: Record<string, string>;
  purposes: Record<string, ScriptPurpose>;
}

/**
 * Project registry entry
 * Central metadata for a project including links and script mappings
 * Format mirrors dApp browser entries for consistency
 */
export interface Project {
  /** Display name (mirrors dApp browser 'label') */
  label: string;
  /** Short tagline */
  caption: string;
  /** Brief summary */
  summary: string;
  /** Longer description */
  description: string;
  /** Project category enum */
  category: ProjectCategory;
  /** Project sub-category enum */
  subCategory: ProjectSubCategory;
  /** Social and website links */
  link: Links;
  /** Script name mappings and purposes */
  scriptMappings: ScriptMappings;
}

/**
 * Image assets for dApp browser entry
 */
export interface DAppImages {
  /** Icon image - base64 data URL or URL */
  icon: string;
  /** Optional promotional banner image */
  banner?: string;
}

/**
 * DApp browser entry for Eternl UI
 * Used to display dApps in the Eternl wallet browser
 */
export interface DAppBrowserEntry {
  /** Display order (optional, lower = higher priority) */
  order?: number;
  /** Categories for filtering */
  categoryList: string[];
  /** Search keywords */
  keywords: string[];
  /** URL triggers/shortcuts */
  trigger: string[];
  /** Primary dApp URL */
  url: string;
  /** Eternl-specific bridge entrypoint */
  urlBridge: string;
  /** Icon and banner images */
  image: DAppImages;
  /** Display name */
  label: string;
  /** Short caption/tagline */
  caption: string;
  /** Brief summary */
  summary: string;
  /** Longer description */
  description: string;
  /** Social and website links */
  link?: Links;
}

/**
 * Script entry in the lookup index
 * Maps a script hash to its project and metadata
 */
export interface ScriptIndexEntry {
  /** Project identifier (kebab-case) */
  projectId: string;
  /** Human-readable script name */
  name: string;
  /** Script purpose: SPEND, MINT, etc. */
  purpose: string;
  /** Script type: PLUTUS or NATIVE */
  type: string;
  /** Plutus language version (1, 2, or 3) */
  plutusVersion?: number;
}

/**
 * Project entry in the lookup index
 * Minimal project metadata for script lookups
 */
export interface ScriptIndexProject {
  /** Display name */
  label: string;
  /** Project category */
  category: string;
  /** Project sub-category */
  subCategory?: string;
  /** Primary website link */
  link?: string;
}

/**
 * Script hash lookup index
 * Provides O(1) lookup from script hash to project
 */
export interface ScriptIndex {
  metadata: {
    generatedAt: string;
    scriptCount: number;
    projectCount: number;
  };
  /** Script hash -> script metadata */
  scripts: Record<string, ScriptIndexEntry>;
  /** Project ID -> project metadata */
  projects: Record<string, ScriptIndexProject>;
}
