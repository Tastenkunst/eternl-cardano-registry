/**
 * Migration script for dApp browser entries
 * Copies entries from eternl-dapp-browser repo to registry/dapps/
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE_REPO = 'C:\\Users\\Mark\\Documents\\GitHub\\eternl-dapp-browser';
const TARGET_DIR = 'C:\\Users\\Mark\\Documents\\GitHub\\eternl-cardano-registry\\registry\\dapps';

const NETWORKS = ['mainnet', 'preprod'] as const;
const ENVIRONMENTS = ['production', 'staging'] as const;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

function copyDAppEntries(): void {
  let totalCopied = 0;

  for (const network of NETWORKS) {
    for (const env of ENVIRONMENTS) {
      const sourceDir = path.join(SOURCE_REPO, network, env);
      const targetDir = path.join(TARGET_DIR, network, env);

      if (!fs.existsSync(sourceDir)) {
        console.log(`Skipping ${network}/${env} - source directory not found`);
        continue;
      }

      ensureDir(targetDir);

      const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(targetDir, file);

        try {
          const content = fs.readFileSync(sourcePath, 'utf-8');
          // Validate it's valid JSON
          JSON.parse(content);
          fs.writeFileSync(targetPath, content);
          console.log(`  Copied: ${network}/${env}/${file}`);
          totalCopied++;
        } catch (err) {
          console.error(`  Error copying ${file}:`, err);
        }
      }

      console.log(`${network}/${env}: ${files.length} entries`);
    }
  }

  console.log(`\nTotal entries copied: ${totalCopied}`);
}

// Run migration
console.log('Migrating dApp browser entries...\n');
copyDAppEntries();
console.log('\nMigration complete!');
