/**
 * Generates script hash lookup index from CRFA v1 dApps
 *
 * Output format (Hybrid - Option 4):
 * {
 *   "scripts": {
 *     "scriptHash": { "projectId": "minswap", "name": "Liquidity Pool", "purpose": "SPEND", "type": "PLUTUS", "plutusVersion": 1 },
 *     ...
 *   },
 *   "projects": {
 *     "minswap": { "label": "Minswap", "category": "DEFI", "link": "https://minswap.org" },
 *     ...
 *   }
 * }
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Source paths (relative from project root)
const CRFA_REPO = '../eternl-crfa-offchain-data-registry';
const V1_DAPPS_PATH = join(CRFA_REPO, 'dApps');

// Output path
const OUTPUT_DIR = './registry/scripts';
const OUTPUT_FILE = join(OUTPUT_DIR, 'script-index.json');

interface V1ScriptVersion {
  version: number;
  plutusVersion?: number;
  scriptHash?: string;
  fullScriptHash?: string;
  contractAddress?: string;
  mintPolicyID?: string;
}

interface V1Script {
  id: string;
  name?: string;
  purpose: string;
  type: string;
  versions: V1ScriptVersion[];
}

interface V1DApp {
  id: string;
  projectName: string;
  link?: string;
  category?: string;
  subCategory?: string;
  scripts?: V1Script[];
}

interface ScriptEntry {
  projectId: string;
  name: string;
  purpose: string;
  type: string;
  plutusVersion?: number;
}

interface ProjectEntry {
  label: string;
  category: string;
  subCategory?: string;
  link?: string;
}

interface ScriptIndex {
  metadata: {
    generatedAt: string;
    scriptCount: number;
    projectCount: number;
  };
  scripts: Record<string, ScriptEntry>;
  projects: Record<string, ProjectEntry>;
}

// Map old CRFA project names to preferred labels
const PROJECT_LABEL_MAP: Record<string, string> = {
  'CSWAP DEX': 'CSWAP',
  'Genius Yield': 'GeniusYield',
  'Splash Protocol': 'Splash',
};

function normalizeProjectLabel(name: string): string {
  return PROJECT_LABEL_MAP[name] || name;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

function generateScriptIndex(): void {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!existsSync(V1_DAPPS_PATH)) {
    console.error(`CRFA v1 dApps directory not found: ${V1_DAPPS_PATH}`);
    process.exit(1);
  }

  const files = readdirSync(V1_DAPPS_PATH).filter(f => f.endsWith('.json'));
  console.log(`Processing ${files.length} v1 dApp files...\n`);

  const scripts: Record<string, ScriptEntry> = {};
  const projects: Record<string, ProjectEntry> = {};

  let totalScripts = 0;
  let duplicates = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(V1_DAPPS_PATH, file), 'utf-8');
      const dapp: V1DApp = JSON.parse(content);

      if (!dapp.projectName) {
        continue;
      }

      const projectId = toKebabCase(dapp.projectName);

      // Add project entry if not exists
      if (!projects[projectId]) {
        projects[projectId] = {
          label: normalizeProjectLabel(dapp.projectName),
          category: dapp.category || 'UNKNOWN',
          subCategory: dapp.subCategory,
          link: dapp.link
        };
      }

      // Process scripts
      if (!dapp.scripts) {
        continue;
      }

      for (const script of dapp.scripts) {
        const scriptName = script.name || `Script ${script.id}`;

        for (const version of script.versions) {
          // Get the script hash (could be scriptHash or mintPolicyID)
          let hash = version.scriptHash || version.mintPolicyID;

          if (!hash) {
            continue;
          }

          // Normalize: lowercase, no prefix
          hash = hash.toLowerCase();

          // Check for duplicates
          if (scripts[hash]) {
            if (scripts[hash].projectId !== projectId) {
              console.warn(`  Duplicate hash ${hash.slice(0, 16)}... - ${scripts[hash].projectId} vs ${projectId}`);
            }
            duplicates++;
            continue;
          }

          scripts[hash] = {
            projectId,
            name: scriptName,
            purpose: script.purpose,
            type: script.type,
            plutusVersion: version.plutusVersion
          };

          totalScripts++;
        }
      }
    } catch (e) {
      console.error(`  Error processing ${file}:`, e);
    }
  }

  const index: ScriptIndex = {
    metadata: {
      generatedAt: new Date().toISOString(),
      scriptCount: Object.keys(scripts).length,
      projectCount: Object.keys(projects).length
    },
    scripts,
    projects
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2) + '\n');

  console.log(`\nScript index generated!`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`  Scripts: ${Object.keys(scripts).length}`);
  console.log(`  Projects: ${Object.keys(projects).length}`);
  console.log(`  Duplicates skipped: ${duplicates}`);
}

generateScriptIndex();
