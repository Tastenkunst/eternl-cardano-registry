/**
 * Imports missing scripts from registry-feedback.json
 *
 * This script:
 * 1. Reads the missing scripts from ccw-backend's registry-feedback.json
 * 2. Adds them to script-index.json
 * 3. Normalizes 112-char hashes to 56-char (payment credential only)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Paths
const FEEDBACK_FILE = '../ccw-backend/offchain_data_registry/registry-feedback.json';
const SCRIPT_INDEX_FILE = './registry/scripts/script-index.json';
const PROJECTS_DIR = './registry/projects';

// Project name mapping: feedback name -> project file id
const PROJECT_NAME_MAP: Record<string, string> = {
  'Genius Yield': 'genius-yield',
  'CSWAP DEX': 'cswap',
  'Splash Protocol': 'splash',
  'Lenfi': 'lenfi',
  'ADA Inmates': 'ada-inmates',
  'ADAO': 'adao',
  'Axo': 'axo',
  'Cardano in Color': 'cardano-in-color',
  'CherryLend': 'cherry-lend',
  'Clay Nation': 'clay-nation',
  'Cardano Name Service': 'cardano-name-service',
  'Danogo Bond': 'danogo-bond',
  'DEADPXLZ': 'deadpxlz',
  'Derp Birds': 'derp-birds',
  'Djed StableCoin': 'djed-stable-coin',
  'Dropspot': 'dropspot',
  'ENCOINS': 'encoins',
  'Fluid Tokens': 'fluid-tokens',
  'Iagon': 'iagon',
  'jpg.store': 'jpgstore',
  'Kreate': 'kreate',
  'Levvy Finance': 'levvy-finance',
  'Liqwid Finance': 'liqwid-finance',
  'Minswap': 'minswap',
  'MuesliSwap': 'muesli-swap',
  'Optim Finance': 'optim-finance',
  'Plutus.Art': 'plutusart',
  "Project NEWM's Marketplace": 'project-newms-marketplace',
  'SaturnNFT': 'saturn-nft',
  'Seedelf': 'seedelf',
  'SpaceBudz': 'space-budz',
  'Spectrum Finance': 'spectrum-finance',
  'Strike Finance': 'strike-finance',
  'SundaeSwap': 'sundae-swap',
  'TeddySwap': 'teddy-swap',
  'The Ape Society': 'the-ape-society',
  'Token Riot': 'token-riot',
  'VyFinance': 'vy-finance',
  'Wanchain': 'wanchain',
};

interface MissingScript {
  scriptHash: string;
  project: string;
  purpose: string;
}

interface FeedbackFile {
  regressions: {
    missingProjects: string[];
    missingScripts: MissingScript[];
  };
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

function normalizeHash(hash: string): string {
  // If hash is 112 chars (56 bytes), it's payment + staking credential
  // Extract just the payment credential (first 56 chars)
  if (hash.length === 112) {
    return hash.slice(0, 56).toLowerCase();
  }
  return hash.toLowerCase();
}

function importMissingScripts(): void {
  // Read feedback file
  if (!existsSync(FEEDBACK_FILE)) {
    console.error(`Feedback file not found: ${FEEDBACK_FILE}`);
    process.exit(1);
  }

  const feedback: FeedbackFile = JSON.parse(readFileSync(FEEDBACK_FILE, 'utf-8'));
  const missingScripts = feedback.regressions.missingScripts;

  console.log(`Found ${missingScripts.length} missing scripts to import\n`);

  // Read current script index
  if (!existsSync(SCRIPT_INDEX_FILE)) {
    console.error(`Script index not found: ${SCRIPT_INDEX_FILE}`);
    process.exit(1);
  }

  const index: ScriptIndex = JSON.parse(readFileSync(SCRIPT_INDEX_FILE, 'utf-8'));

  let added = 0;
  let skipped = 0;
  let normalized = 0;
  const projectsUsed = new Set<string>();

  // First pass: normalize existing 112-char hashes
  const existingHashes = Object.keys(index.scripts);
  for (const hash of existingHashes) {
    if (hash.length === 112) {
      const normalizedHash = normalizeHash(hash);
      if (!index.scripts[normalizedHash]) {
        // Add entry with normalized hash
        index.scripts[normalizedHash] = { ...index.scripts[hash] };
        normalized++;
        console.log(`  Normalized: ${hash.slice(0, 20)}... -> ${normalizedHash.slice(0, 20)}...`);
      }
    }
  }

  // Second pass: import missing scripts
  for (const missing of missingScripts) {
    const hash = normalizeHash(missing.scriptHash);

    // Check if already exists
    if (index.scripts[hash]) {
      skipped++;
      continue;
    }

    // Map project name to project ID
    const projectId = PROJECT_NAME_MAP[missing.project];
    if (!projectId) {
      console.warn(`  Unknown project: ${missing.project} - skipping script ${hash.slice(0, 16)}...`);
      skipped++;
      continue;
    }

    // Add script entry
    index.scripts[hash] = {
      projectId,
      name: `${missing.project} Script`,
      purpose: missing.purpose,
      type: 'PLUTUS',
      plutusVersion: 2, // Default to Plutus V2
    };

    projectsUsed.add(projectId);
    added++;
  }

  // Update metadata
  index.metadata.generatedAt = new Date().toISOString();
  index.metadata.scriptCount = Object.keys(index.scripts).length;
  index.metadata.projectCount = Object.keys(index.projects).length;

  // Write updated index
  writeFileSync(SCRIPT_INDEX_FILE, JSON.stringify(index, null, 2) + '\n');

  console.log(`\nImport complete!`);
  console.log(`  Added: ${added} scripts`);
  console.log(`  Normalized: ${normalized} 112-char hashes`);
  console.log(`  Skipped: ${skipped} (already exist or unknown project)`);
  console.log(`  Total scripts: ${index.metadata.scriptCount}`);
  console.log(`  Projects used: ${Array.from(projectsUsed).join(', ')}`);
}

importMissingScripts();
