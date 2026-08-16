import fs from 'node:fs';
import path from 'node:path';

const roots = ['dist/preload', 'dist/assets'];
const forbidden = [
  'HAGICODE_POSTHOG_NODE_KEY',
  'POSTHOG_NODE_KEY',
  'HAGICODE_SENTRY_AUTH_TOKEN',
  'SENTRY_AUTH_TOKEN',
];

for (const root of roots) {
  const absolute = path.resolve(root);
  if (!fs.existsSync(absolute)) continue;
  const files = fs.readdirSync(absolute, { recursive: true })
    .filter((file) => typeof file === 'string')
    .map((file) => path.join(absolute, file))
    .filter((file) => fs.statSync(file).isFile());
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const token of forbidden) {
      if (source.includes(token)) {
        throw new Error(`Server telemetry token found in renderer/preload artifact: ${file}`);
      }
    }
  }
}

console.log('telemetry bundle boundary check passed');
