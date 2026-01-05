import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Project, Links, ProjectCategory, ProjectSubCategory, ScriptPurpose } from '../src/types/index.js';

// Source paths
const CRFA_REPO = 'C:/Users/Mark/Documents/GitHub/eternl-crfa-offchain-data-registry';
const DAPP_BROWSER_REPO = 'C:/Users/Mark/Documents/GitHub/eternl-dapp-browser';
const METADATA_MAPPING_PATH = join(CRFA_REPO, 'dApps_v2/metadata-mapping.json');
const DAPP_BROWSER_MAINNET = join(DAPP_BROWSER_REPO, 'mainnet/production');

// Output path
const OUTPUT_DIR = './registry/projects';

interface SourceMapping {
  projectName: string;
  category: string;
  subCategory: string;
  link: string;
  twitter: string;
  description: {
    short: string;
  };
  audits: unknown[];
  releases: unknown[];
  scriptMappings: {
    names: Record<string, string>;
    purposes: Record<string, string>;
  };
}

interface SourceMetadataMapping {
  mappings: Record<string, SourceMapping>;
}

interface DappBrowserEntry {
  label?: string;
  caption?: string;
  summary?: string;
  description?: string;
  link?: {
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
  };
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function loadDappBrowserEntries(): Map<string, DappBrowserEntry> {
  const entries = new Map<string, DappBrowserEntry>();

  if (!existsSync(DAPP_BROWSER_MAINNET)) {
    console.log('DApp browser repo not found, skipping link enrichment');
    return entries;
  }

  const files = readdirSync(DAPP_BROWSER_MAINNET).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = readFileSync(join(DAPP_BROWSER_MAINNET, file), 'utf-8');
      const entry = JSON.parse(content) as DappBrowserEntry;
      const name = file.replace('.json', '');
      entries.set(name.toLowerCase(), entry);
      if (entry.label) {
        entries.set(entry.label.toLowerCase(), entry);
      }
    } catch (e) {
      console.warn(`Failed to parse ${file}:`, e);
    }
  }

  return entries;
}

function findDappBrowserEntry(projectName: string, dappEntries: Map<string, DappBrowserEntry>): DappBrowserEntry | undefined {
  const normalized = projectName.toLowerCase().replace(/[\s-]/g, '');

  // Try exact match first
  if (dappEntries.has(projectName.toLowerCase())) {
    return dappEntries.get(projectName.toLowerCase());
  }

  // Try normalized match
  for (const [key, entry] of dappEntries) {
    if (key.replace(/[\s-]/g, '') === normalized) {
      return entry;
    }
  }

  return undefined;
}

function migrateProjects(): void {
  console.log('Loading metadata-mapping.json...');
  const sourceContent = readFileSync(METADATA_MAPPING_PATH, 'utf-8');
  const source: SourceMetadataMapping = JSON.parse(sourceContent);

  console.log('Loading dApp browser entries for link enrichment...');
  const dappEntries = loadDappBrowserEntries();
  console.log(`Found ${dappEntries.size} dApp browser entries`);

  const projects = Object.entries(source.mappings);
  console.log(`Migrating ${projects.length} projects...`);

  for (const [key, mapping] of projects) {
    const dappEntry = findDappBrowserEntry(mapping.projectName, dappEntries);

    // Build links object
    const links: Links = {};

    // First, add any links from dApp browser entry
    if (dappEntry?.link) {
      Object.assign(links, dappEntry.link);
    }

    // Add twitter from source if present and not already in links
    if (mapping.twitter && !links.x) {
      links.x = mapping.twitter;
    }

    // Add main link as website if present and not already set
    if (mapping.link && !links.website) {
      links.website = mapping.link;
    }

    // Build description fields (mirror dApp browser format)
    let caption = dappEntry?.caption || '';
    let summary = dappEntry?.summary || mapping.description?.short || '';
    let description = dappEntry?.description || '';

    const project: Project = {
      label: mapping.projectName,
      caption,
      summary,
      description,
      category: (mapping.category || 'UNKNOWN') as ProjectCategory,
      subCategory: (mapping.subCategory || 'UNKNOWN') as ProjectSubCategory,
      link: links,
      scriptMappings: {
        names: mapping.scriptMappings?.names || {},
        purposes: (mapping.scriptMappings?.purposes || {}) as Record<string, ScriptPurpose>
      }
    };

    const filename = `${toKebabCase(mapping.projectName)}.json`;
    const outputPath = join(OUTPUT_DIR, filename);

    writeFileSync(outputPath, JSON.stringify(project, null, 2) + '\n');
    console.log(`  Created: ${filename}`);
  }

  console.log(`\nMigration complete! Created ${projects.length} project files.`);
}

migrateProjects();
