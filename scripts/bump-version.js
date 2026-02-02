#!/usr/bin/env node
/**
 * Version bump script
 * Automatically increments the patch version number in package.json
 * Used for local testing where each build needs a new version number
 *
 * Usage:
 *   node scripts/bump-version.js     - Increment patch version (1.0.0 -> 1.0.1)
 *   node scripts/bump-version.js --dry-run - Preview version change without modifying
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// Get package.json path
const pkgPath = path.join(__dirname, '..', 'package.json');

// Read current package.json
const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
const pkg = JSON.parse(pkgContent);

const currentVersion = pkg.version;
console.log(`Current version: ${currentVersion}`);

// Parse semver version
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Increment patch version
const newVersion = `${major}.${minor}.${patch + 1}`;

console.log(`New version: ${newVersion}`);

if (isDryRun) {
  console.log('[DRY RUN] Version would be bumped, but no changes were made.');
  process.exit(0);
}

// Update package.json
pkg.version = newVersion;

// Write back to package.json with proper formatting
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

console.log(`✓ Version bumped: ${currentVersion} → ${newVersion}`);
