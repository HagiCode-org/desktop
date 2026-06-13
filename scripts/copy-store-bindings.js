import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'src', 'main', 'subscription', 'generated-js');
const distDir = path.join(projectRoot, 'dist', 'main', 'subscription', 'generated-js');

if (!fs.existsSync(sourceDir)) {
  console.log('[copy-store-bindings] No generated store bindings found under src/. Skipping copy.');
  process.exit(0);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(distDir), { recursive: true });
fs.cpSync(sourceDir, distDir, { recursive: true });

console.log('[copy-store-bindings] Copied generated store bindings to dist/main/subscription/generated-js.');
