/**
 * Generates script hash lookup index from local project files
 *
 * Features:
 * - Reads from registry/projects/*.json (local source of truth)
 * - Merges with existing index (non-destructive)
 * - Resolves Plutus version via db-sync if missing
 * - Dry-run mode to preview changes
 *
 * Usage:
 *   npx ts-node scripts/generate-script-index.ts [--dry-run]
 *
 * Environment variables (for db-sync lookup):
 *   DBS_DATABASE_NAME, DBS_DATABASE_HOST, DBS_DATABASE_USER,
 *   DBS_DATABASE_PASSWORD, DBS_DATABASE_PORT
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

// Load .env from project root
dotenv.config();

// Paths
const PROJECTS_DIR = './registry/projects';
const OUTPUT_DIR = './registry/scripts';
const OUTPUT_FILE = join(OUTPUT_DIR, 'script-index.json');

// DB connection (optional - only used if env vars are set)
let dbPool: pg.Pool | null = null;

function initDb(): boolean {
  const { DBS_DATABASE_NAME, DBS_DATABASE_HOST, DBS_DATABASE_USER, DBS_DATABASE_PASSWORD, DBS_DATABASE_PORT } = process.env;

  if (!DBS_DATABASE_NAME || !DBS_DATABASE_HOST || !DBS_DATABASE_USER || !DBS_DATABASE_PASSWORD || !DBS_DATABASE_PORT) {
    console.log('DB environment variables not set - script type lookup disabled');
    return false;
  }

  dbPool = new pg.Pool({
    database: DBS_DATABASE_NAME,
    host: DBS_DATABASE_HOST,
    user: DBS_DATABASE_USER,
    password: DBS_DATABASE_PASSWORD,
    port: parseInt(DBS_DATABASE_PORT, 10),
  });

  console.log(`Connected to db-sync: ${DBS_DATABASE_HOST}/${DBS_DATABASE_NAME}`);
  return true;
}

async function closeDb(): Promise<void> {
  if (dbPool) {
    await dbPool.end();
  }
}

interface ProjectScript {
  name: string;
  scriptHash: string;
  purpose?: string;
  type?: string;
  plutusVersion?: number;
}

interface Project {
  label?: string;
  projectName?: string;  // legacy, prefer label
  category?: string;
  subCategory?: string;
  link?: {
    website?: string;
    [key: string]: string | undefined;
  };
  scripts?: ProjectScript[];
}

interface ScriptEntry {
  projectId: string;
  name: string;
  purpose?: string;
  type?: string;
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

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

async function lookupScriptInfo(scriptHash: string): Promise<{ type: string; plutusVersion: number } | null> {
  if (!dbPool) {
    return null;
  }

  try {
    const result = await dbPool.query(
      `SELECT type FROM script WHERE hash = DECODE($1, 'hex')`,
      [scriptHash]
    );

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    const dbType = result.rows[0].type as string;

    // Parse db-sync type format: 'PlutusV1', 'PlutusV2', 'PlutusV3', 'timelock'
    if (dbType === 'timelock') {
      return { type: 'NATIVE', plutusVersion: 0 };
    }

    const match = dbType.match(/PlutusV(\d)/i);
    if (match) {
      return { type: 'PLUTUS', plutusVersion: parseInt(match[1], 10) };
    }

    return null;
  } catch (e) {
    return null;
  }
}

async function generateScriptIndex(dryRun: boolean): Promise<void> {
  console.log(dryRun ? '=== DRY RUN ===' : '=== Generating Script Index ===');
  console.log();

  // Initialize DB connection
  const dbAvailable = initDb();

  // Load existing index if present
  let existingIndex: ScriptIndex | null = null;
  if (existsSync(OUTPUT_FILE)) {
    try {
      existingIndex = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
      console.log(`Loaded existing index: ${existingIndex!.metadata.scriptCount} scripts, ${existingIndex!.metadata.projectCount} projects`);
    } catch (e) {
      console.warn('Could not parse existing index, starting fresh');
    }
  }

  // Start with existing data or empty
  const scripts: Record<string, ScriptEntry> = existingIndex?.scripts || {};
  const projects: Record<string, ProjectEntry> = existingIndex?.projects || {};

  // Track changes
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let lookupCount = 0;
  const projectFilesToUpdate: Map<string, object> = new Map();

  // Read all project files
  if (!existsSync(PROJECTS_DIR)) {
    console.error(`Projects directory not found: ${PROJECTS_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
  console.log(`Processing ${files.length} project files...\n`);

  for (const file of files) {
    try {
      const filePath = join(PROJECTS_DIR, file);
      const content = readFileSync(filePath, 'utf-8');
      const project: Project = JSON.parse(content);
      let projectModified = false;

      const projectLabel = project.label || project.projectName;
      if (!projectLabel) {
        console.warn(`  Skipping ${file}: no label or projectName`);
        continue;
      }

      const projectId = toKebabCase(projectLabel);

      // Update project entry
      const newProjectEntry: ProjectEntry = {
        label: projectLabel,
        category: project.category || 'UNKNOWN',
        subCategory: project.subCategory,
        link: project.link?.website
      };

      if (!projects[projectId]) {
        projects[projectId] = newProjectEntry;
        console.log(`  + Project: ${projectId}`);
      } else {
        // Update if changed
        projects[projectId] = { ...projects[projectId], ...newProjectEntry };
      }

      // Process scripts
      if (!project.scripts || project.scripts.length === 0) {
        continue;
      }

      for (const script of project.scripts) {
        if (!script.scriptHash) {
          continue;
        }

        const hash = script.scriptHash.toLowerCase();
        const existing = scripts[hash];

        // Determine type and plutusVersion
        let type = script.type;
        let plutusVersion = script.plutusVersion;

        // If missing, try to resolve from existing index or db-sync
        if (!type || plutusVersion === undefined) {
          // Check if existing index entry has this info
          if (existing?.type && existing?.plutusVersion !== undefined) {
            type = type || existing.type;
            plutusVersion = plutusVersion ?? existing.plutusVersion;

            // Update the original script object for writing back
            if (!script.type && existing.type) {
              script.type = existing.type;
              projectModified = true;
            }
            if (script.plutusVersion === undefined && existing.plutusVersion !== undefined) {
              script.plutusVersion = existing.plutusVersion;
              projectModified = true;
            }
          } else if (dbAvailable) {
            // Lookup via db-sync
            console.log(`    Looking up ${hash.slice(0, 16)}...`);
            lookupCount++;
            const info = await lookupScriptInfo(hash);
            if (info) {
              type = type || info.type;
              plutusVersion = plutusVersion ?? info.plutusVersion;
              console.log(`      Found: ${info.type} v${info.plutusVersion}`);

              // Update the original script object for writing back
              if (!script.type && info.type) {
                script.type = info.type;
                projectModified = true;
              }
              if (script.plutusVersion === undefined && info.plutusVersion !== undefined) {
                script.plutusVersion = info.plutusVersion;
                projectModified = true;
              }
            } else {
              console.log(`      Not found in db-sync`);
            }
          }
        }

        const newEntry: ScriptEntry = {
          projectId,
          name: script.name,
          purpose: script.purpose,
          type,
          plutusVersion
        };

        if (!existing) {
          scripts[hash] = newEntry;
          added++;
          console.log(`    + ${script.name} (${hash.slice(0, 12)}...)`);
        } else if (
          existing.projectId !== newEntry.projectId ||
          existing.name !== newEntry.name ||
          existing.purpose !== newEntry.purpose ||
          existing.type !== newEntry.type ||
          existing.plutusVersion !== newEntry.plutusVersion
        ) {
          scripts[hash] = newEntry;
          updated++;
          console.log(`    ~ ${script.name} (${hash.slice(0, 12)}...)`);
        } else {
          unchanged++;
        }
      }

      // Track project files that need updating
      if (projectModified) {
        projectFilesToUpdate.set(filePath, project);
      }
    } catch (e) {
      console.error(`  Error processing ${file}:`, e);
    }
  }

  // Close DB connection
  await closeDb();

  // Write updated project files
  if (!dryRun && projectFilesToUpdate.size > 0) {
    console.log(`\nUpdating ${projectFilesToUpdate.size} project file(s) with discovered script info...`);
    for (const [filePath, project] of projectFilesToUpdate) {
      writeFileSync(filePath, JSON.stringify(project, null, 2) + '\n');
      console.log(`  Updated: ${filePath}`);
    }
  } else if (projectFilesToUpdate.size > 0) {
    console.log(`\n(Would update ${projectFilesToUpdate.size} project file(s) - dry run)`);
  }

  // Build final index
  const index: ScriptIndex = {
    metadata: {
      generatedAt: new Date().toISOString(),
      scriptCount: Object.keys(scripts).length,
      projectCount: Object.keys(projects).length
    },
    scripts,
    projects
  };

  console.log();
  console.log('=== Summary ===');
  console.log(`  Added: ${added}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  DB lookups: ${lookupCount}`);
  console.log(`  Project files updated: ${projectFilesToUpdate.size}`);
  console.log(`  Total scripts: ${index.metadata.scriptCount}`);
  console.log(`  Total projects: ${index.metadata.projectCount}`);

  if (dryRun) {
    console.log('\n(Dry run - no changes written)');
  } else {
    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2) + '\n');
    console.log(`\nWritten to: ${OUTPUT_FILE}`);
  }
}

// Parse args and run
const dryRun = process.argv.includes('--dry-run');
generateScriptIndex(dryRun);
