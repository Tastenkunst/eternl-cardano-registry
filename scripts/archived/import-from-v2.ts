/**
 * Import missing scripts from dApps_v2/ format
 *
 * The v2 files contain scripts that were added via the SteelSwap import
 * (processing CSV files + db-sync queries) that don't exist in v1.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CRFA_V2_DIR = 'C:\\Users\\Mark\\Documents\\GitHub\\eternl-crfa-offchain-data-registry\\dApps_v2';
const SCRIPT_INDEX_PATH = path.join(__dirname, '..', 'registry', 'scripts', 'script-index.json');
const PROJECTS_DIR = path.join(__dirname, '..', 'registry', 'projects');

// Map v2 projectName to our projectId (kebab-case filename)
const PROJECT_NAME_MAP: Record<string, string> = {
  'Minswap': 'minswap',
  'MuesliSwap': 'muesli-swap',
  'Spectrum': 'spectrum',
  'SpectrumFinance': 'spectrum',
  'Splash': 'splash',
  'SplashProtocol': 'splash',
  'SundaeSwap': 'sundae-swap',
  'VyFinance': 'vy-finance',
  'VyFi': 'vy-finance',
  'Wingriders': 'wingriders',
  'WingRiders': 'wingriders',
  'GeniusYield': 'genius-yield',
  'Genius Yield': 'genius-yield',
  'CSWAP': 'cswap',
  'CSWAP DEX': 'cswap',
  'Liqwid': 'liqwid-finance',
  'LiqwidFinance': 'liqwid-finance',
  'Optim': 'optim-finance',
  'OptimFinance': 'optim-finance',
  'Indigo': 'indigo-protocol',
  'IndigoProtocol': 'indigo-protocol',
  'jpg.store': 'jpgstore',
  'jpgStore': 'jpgstore',
  'Lenfi': 'lenfi',
  'AadaFinance': 'lenfi',
  'TeddySwap': 'teddy-swap',
  'Axo': 'axo',
  'DexHunter': 'dex-hunter',
  'Djed': 'djed',
  'Charli3': 'charli3',
  'Orcfax': 'orcfax',
  'FluidTokens': 'fluid-tokens',
  'Encoins': 'encoins',
  'Seedelf': 'seedelf',
  'Iagon': 'iagon',
  'StrikeFinance': 'strike-finance',
  'Meld': 'meld',
  'SingularityNET': 'singularitynet',
  'AdaHandle': 'ada-handle',
  'CNS': 'cns',
  'Book': 'book-io',
  'Hydra': 'hydra',
};

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
}

function getProjectId(projectName: string): string {
  // Check explicit mapping first
  if (PROJECT_NAME_MAP[projectName]) {
    return PROJECT_NAME_MAP[projectName];
  }
  // Fall back to kebab-case conversion
  return toKebabCase(projectName);
}

interface V2Script {
  name: string;
  purpose: string;
  type: string;
  scriptHash: string;
  plutusVersion?: number;
  protocolVersion?: number;
}

interface V2DApp {
  projectName: string;
  link?: string;
  twitter?: string;
  category?: string;
  subCategory?: string;
  description?: { short: string };
  scripts?: V2Script[];
}

interface ScriptIndexEntry {
  projectId: string;
  name: string;
  purpose: string;
}

interface ScriptIndex {
  metadata: {
    generatedAt: string;
    scriptCount: number;
    projectCount: number;
  };
  scripts: Record<string, ScriptIndexEntry>;
  projects: Record<string, {
    label: string;
    category: string;
    subCategory?: string;
    link?: string;
  }>;
}

function loadScriptIndex(): ScriptIndex {
  const content = fs.readFileSync(SCRIPT_INDEX_PATH, 'utf-8');
  return JSON.parse(content);
}

function saveScriptIndex(index: ScriptIndex): void {
  index.metadata.generatedAt = new Date().toISOString();
  index.metadata.scriptCount = Object.keys(index.scripts).length;
  index.metadata.projectCount = Object.keys(index.projects).length;
  fs.writeFileSync(SCRIPT_INDEX_PATH, JSON.stringify(index, null, 2));
}

function loadV2Files(): V2DApp[] {
  const files = fs.readdirSync(CRFA_V2_DIR)
    .filter(f => f.endsWith('.json') && f !== 'metadata-mapping.json');

  const dapps: V2DApp[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(CRFA_V2_DIR, file), 'utf-8');
    try {
      const dapp = JSON.parse(content) as V2DApp;
      if (dapp.projectName && dapp.scripts && dapp.scripts.length > 0) {
        dapps.push(dapp);
      }
    } catch (e) {
      console.error(`Error parsing ${file}:`, e);
    }
  }
  return dapps;
}

function ensureProjectExists(
  index: ScriptIndex,
  projectId: string,
  dapp: V2DApp
): void {
  if (!index.projects[projectId]) {
    // Check if project file exists
    const projectPath = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (fs.existsSync(projectPath)) {
      const projectContent = fs.readFileSync(projectPath, 'utf-8');
      const project = JSON.parse(projectContent);
      index.projects[projectId] = {
        label: project.label || dapp.projectName,
        category: project.category || dapp.category || 'UNKNOWN',
        subCategory: project.subCategory || dapp.subCategory,
        link: project.link?.website || dapp.link,
      };
    } else {
      // Create minimal project entry in index
      index.projects[projectId] = {
        label: dapp.projectName,
        category: dapp.category || 'UNKNOWN',
        subCategory: dapp.subCategory,
        link: dapp.link,
      };
    }
  }
}

function main() {
  console.log('='.repeat(80));
  console.log('Importing scripts from dApps_v2/');
  console.log('='.repeat(80));
  console.log();

  // Load current script index
  const index = loadScriptIndex();
  const existingHashes = new Set(Object.keys(index.scripts));
  console.log(`Current script-index.json: ${existingHashes.size} scripts`);
  console.log();

  // Load v2 files
  const v2Dapps = loadV2Files();
  console.log(`Found ${v2Dapps.length} v2 dApp files with scripts`);
  console.log();

  // Track stats
  let addedCount = 0;
  let skippedCount = 0;
  const addedByProject: Record<string, number> = {};

  // Process each v2 dApp
  for (const dapp of v2Dapps) {
    const projectId = getProjectId(dapp.projectName);

    // Ensure project exists in index
    ensureProjectExists(index, projectId, dapp);

    for (const script of dapp.scripts || []) {
      const hash = script.scriptHash.toLowerCase();

      // Skip if already exists
      if (existingHashes.has(hash)) {
        skippedCount++;
        continue;
      }

      // Skip non-standard hash lengths (will need manual review)
      if (hash.length !== 56) {
        console.log(`  Skipping non-standard hash (${hash.length} chars): ${hash.substring(0, 20)}...`);
        continue;
      }

      // Add to index
      index.scripts[hash] = {
        projectId,
        name: script.name,
        purpose: script.purpose,
      };
      existingHashes.add(hash);
      addedCount++;
      addedByProject[projectId] = (addedByProject[projectId] || 0) + 1;
    }
  }

  // Save updated index
  saveScriptIndex(index);

  // Print summary
  console.log('='.repeat(80));
  console.log('Summary:');
  console.log(`  Added: ${addedCount} scripts`);
  console.log(`  Skipped (already exist): ${skippedCount}`);
  console.log(`  Total scripts now: ${Object.keys(index.scripts).length}`);
  console.log();

  if (Object.keys(addedByProject).length > 0) {
    console.log('Added by project:');
    const sorted = Object.entries(addedByProject).sort((a, b) => b[1] - a[1]);
    for (const [projectId, count] of sorted) {
      console.log(`  ${projectId}: ${count}`);
    }
  }

  console.log('='.repeat(80));
}

main();
