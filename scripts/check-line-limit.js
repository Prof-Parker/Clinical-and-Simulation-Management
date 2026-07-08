/**
 * CI guard: fail if any src JS file exceeds 500 lines.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', 'src');
const LIMIT = 500;
const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (name.endsWith('.js')) {
      const lines = readFileSync(path, 'utf8').split('\n').length;
      if (lines > LIMIT) {
        violations.push({ path, lines });
      }
    }
  }
}

walk(ROOT);

if (violations.length) {
  console.error('Files exceeding 500 lines:');
  violations.forEach(({ path, lines }) => console.error(`  ${lines}\t${path}`));
  process.exit(1);
}

console.log('All src JS files are within the 500-line limit.');
