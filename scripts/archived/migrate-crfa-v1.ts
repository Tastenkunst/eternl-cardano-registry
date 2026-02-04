/**
 * Migration script for CRFA v1 dApps
 * Imports project metadata from eternl-crfa-offchain-data-registry/dApps/
 * Skips projects that already exist to preserve enriched data
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import type { Project, Links, ProjectCategory, ProjectSubCategory } from '../src/types/index.js';

// Source paths (relative from project root)
const CRFA_REPO = '../eternl-crfa-offchain-data-registry';
const DAPP_BROWSER_REPO = '../eternl-dapp-browser';
const V1_DAPPS_PATH = join(CRFA_REPO, 'dApps');
const DAPP_BROWSER_MAINNET = join(DAPP_BROWSER_REPO, 'mainnet/production');

// Output path
const OUTPUT_DIR = './registry/projects';

interface V1Script {
  id: string;
  name?: string;
  purpose: string;
  type: string;
  versions: Array<{
    version: number;
    plutusVersion?: number;
    scriptHash?: string;
    fullScriptHash?: string;
    contractAddress?: string;
    mintPolicyID?: string;
  }>;
}

interface V1DApp {
  id: string;
  projectName: string;
  link?: string;
  twitter?: string;
  category?: string;
  subCategory?: string;
  description?: {
    short?: string;
  };
  scripts?: V1Script[];
}

interface DappBrowserEntry {
  label?: string;
  caption?: string;
  summary?: string;
  description?: string;
  link?: Links;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
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
  const normalized = projectName.toLowerCase().replace(/[\s\-_.]/g, '');

  // Try exact match first
  if (dappEntries.has(projectName.toLowerCase())) {
    return dappEntries.get(projectName.toLowerCase());
  }

  // Try normalized match
  for (const [key, entry] of dappEntries) {
    if (key.replace(/[\s\-_.]/g, '') === normalized) {
      return entry;
    }
  }

  return undefined;
}

function migrateV1Projects(): void {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!existsSync(V1_DAPPS_PATH)) {
    console.error(`CRFA v1 dApps directory not found: ${V1_DAPPS_PATH}`);
    process.exit(1);
  }

  console.log('Loading dApp browser entries for link enrichment...');
  const dappEntries = loadDappBrowserEntries();
  console.log(`Found ${dappEntries.size} dApp browser entries\n`);

  const files = readdirSync(V1_DAPPS_PATH).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} v1 dApp files\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(V1_DAPPS_PATH, file), 'utf-8');
      const dapp: V1DApp = JSON.parse(content);

      if (!dapp.projectName) {
        console.warn(`  Skipping ${file}: no projectName`);
        skipped++;
        continue;
      }

      const filename = `${toKebabCase(dapp.projectName)}.json`;
      const outputPath = join(OUTPUT_DIR, filename);

      // Skip if project already exists
      if (existsSync(outputPath)) {
        console.log(`  Exists: ${filename} (skipping)`);
        skipped++;
        continue;
      }

      const dappEntry = findDappBrowserEntry(dapp.projectName, dappEntries);

      // Build links object
      const links: Links = {};

      // Add links from dApp browser entry if found
      if (dappEntry?.link) {
        Object.assign(links, dappEntry.link);
      }

      // Add twitter from v1 if present and not already set
      if (dapp.twitter && !links.x) {
        // Normalize twitter URL
        const twitterHandle = dapp.twitter.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//, '');
        links.x = `https://x.com/${twitterHandle}`;
      }

      // Add main link as website if present and not already set
      if (dapp.link && !links.website) {
        links.website = dapp.link;
      }

      // Build description fields
      const caption = dappEntry?.caption || '';
      const summary = dappEntry?.summary || dapp.description?.short || '';
      const description = dappEntry?.description || dapp.description?.short || '';

      // Build scriptMappings from v1 scripts
      const scriptNames: Record<string, string> = {};
      const scriptPurposes: Record<string, string> = {};

      if (dapp.scripts) {
        for (const script of dapp.scripts) {
          if (script.name) {
            // Use script name as the key
            const key = script.name.replace(/\s+/g, '');
            scriptNames[key] = script.name;
            scriptPurposes[key] = script.purpose || 'SPEND';
          }
        }
      }

      const project: Project = {
        label: dapp.projectName,
        caption,
        summary,
        description,
        category: (dapp.category || 'UNKNOWN') as ProjectCategory,
        subCategory: (dapp.subCategory || 'UNKNOWN') as ProjectSubCategory,
        link: links,
        scriptMappings: {
          names: scriptNames,
          purposes: scriptPurposes as Record<string, any>
        }
      };

      writeFileSync(outputPath, JSON.stringify(project, null, 2) + '\n');
      console.log(`  Created: ${filename}`);
      created++;
    } catch (e) {
      console.error(`  Error processing ${file}:`, e);
      errors++;
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

migrateV1Projects();
