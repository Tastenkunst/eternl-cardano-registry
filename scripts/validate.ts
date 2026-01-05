/**
 * Validates all registry data against JSON schemas
 * Run with: npx tsx scripts/validate.ts
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

// Paths
const SCHEMAS_DIR = './schemas';
const REGISTRY_DIR = './registry';

interface ValidationResult {
  file: string;
  valid: boolean;
  errors?: string[];
}

function loadSchema(schemaPath: string): object {
  const content = readFileSync(schemaPath, 'utf-8');
  return JSON.parse(content);
}

function validateFiles(
  dir: string,
  ajv: Ajv,
  schemaId: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!existsSync(dir)) {
    return results;
  }

  const files = readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = join(dir, file.name);

    if (file.isDirectory()) {
      // Recurse into subdirectories
      results.push(...validateFiles(filePath, ajv, schemaId));
    } else if (file.name.endsWith('.json')) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        const validate = ajv.getSchema(schemaId);

        if (!validate) {
          results.push({
            file: filePath,
            valid: false,
            errors: [`Schema not found: ${schemaId}`]
          });
          continue;
        }

        const valid = validate(data);

        if (valid) {
          results.push({ file: filePath, valid: true });
        } else {
          results.push({
            file: filePath,
            valid: false,
            errors: validate.errors?.map(
              (e) => `${e.instancePath || '/'}: ${e.message}`
            )
          });
        }
      } catch (e) {
        results.push({
          file: filePath,
          valid: false,
          errors: [`Parse error: ${e instanceof Error ? e.message : String(e)}`]
        });
      }
    }
  }

  return results;
}

function printResults(title: string, results: ValidationResult[]): void {
  const valid = results.filter((r) => r.valid);
  const invalid = results.filter((r) => !r.valid);

  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
  console.log(`  Valid: ${valid.length}`);
  console.log(`  Invalid: ${invalid.length}`);

  if (invalid.length > 0) {
    console.log('\nErrors:');
    for (const result of invalid) {
      console.log(`  ${result.file}:`);
      for (const error of result.errors || []) {
        console.log(`    - ${error}`);
      }
    }
  }
}

function main(): void {
  console.log('Validating registry data...\n');

  // Initialize AJV
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Load schemas
  const projectSchema = loadSchema(join(SCHEMAS_DIR, 'project.schema.json'));
  const dappSchema = loadSchema(join(SCHEMAS_DIR, 'dapp-browser.schema.json'));

  ajv.addSchema(projectSchema, 'project');
  ajv.addSchema(dappSchema, 'dapp-browser');

  // Validate projects
  const projectResults = validateFiles(
    join(REGISTRY_DIR, 'projects'),
    ajv,
    'project'
  );
  printResults('Projects', projectResults);

  // Validate dApp browser entries
  const dappResults = validateFiles(
    join(REGISTRY_DIR, 'dapps'),
    ajv,
    'dapp-browser'
  );
  printResults('DApp Browser Entries', dappResults);

  // Summary
  const allResults = [...projectResults, ...dappResults];
  const totalValid = allResults.filter((r) => r.valid).length;
  const totalInvalid = allResults.filter((r) => !r.valid).length;

  console.log('\n' + '='.repeat(40));
  console.log('SUMMARY');
  console.log('='.repeat(40));
  console.log(`Total files: ${allResults.length}`);
  console.log(`Valid: ${totalValid}`);
  console.log(`Invalid: ${totalInvalid}`);

  // Exit with error code if any invalid
  if (totalInvalid > 0) {
    console.log('\nValidation FAILED');
    process.exit(1);
  } else {
    console.log('\nValidation PASSED');
    process.exit(0);
  }
}

main();
