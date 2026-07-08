/**
 * Bulk IIFE → ESM conversion for legacy js/ modules.
 * Run once during migration: node scripts/bulk-convert.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const PATH_MAP = {
  'js/state.js': 'src/core/state.js',
  'js/course-defaults.js': 'src/core/course-defaults.js',
  'js/clinical-sites-library.js': 'src/core/clinical-sites-library.js',
  'js/calendar-engine.js': 'src/core/calendar-engine.js',
  'js/roster-balance.js': 'src/core/roster-balance.js',
  'js/orientation.js': 'src/core/orientation.js',
  'js/clinical-sites.js': 'src/core/clinical-sites.js',
  'js/validator.js': 'src/core/validator.js',
  'js/feasibility.js': 'src/core/feasibility.js',
  'js/schedule-status.js': 'src/core/schedule-status.js',
  'js/makeup-display.js': 'src/core/makeup-display.js',
  'js/audit.js': 'src/audit/audit.js',
  'js/audit-snapshot.js': 'src/audit/audit-snapshot.js',
  'js/audit-export.js': 'src/audit/audit-export.js',
  'js/proposal-format.js': 'src/proposals/proposal-format.js',
  'js/proposals.js': 'src/proposals/proposals.js',
  'js/setup-draft.js': 'src/proposals/setup-draft.js',
  'js/storage.js': 'src/storage/semester-storage.js',
  'js/user-storage.js': 'src/storage/user-storage.js',
  'js/users-registry-storage.js': 'src/storage/users-registry-storage.js',
  'js/user-directory.js': 'src/storage/user-directory.js',
  'js/playground-storage.js': 'src/storage/playground-storage.js',
  'js/clinical-sites-library-storage.js': 'src/storage/clinical-sites-library-storage.js',
  'js/sim-faculty-storage.js': 'src/storage/sim-faculty-storage.js',
  'js/user-template.js': 'src/auth/user-template.js',
  'js/user-data.js': 'src/auth/user-data.js',
  'js/user-session.js': 'src/auth/user-session.js',
  'js/permissions.js': 'src/auth/permissions.js',
  'js/sim-faculty-data.js': 'src/auth/sim-faculty-data.js',
  'js/dashboard-export.js': 'src/export/dashboard-export.js',
  'js/theme.js': 'src/ui/theme.js',
  'js/pwa.js': 'src/pwa.js',
  'js/ui/master-calendar.js': 'src/ui/master-calendar.js',
  'js/ui/student-view.js': 'src/ui/student-view.js',
  'js/ui/sim-roles.js': 'src/ui/sim-roles.js',
  'js/ui/makeup-finder.js': 'src/ui/makeup-finder.js',
  'js/ui/audit-closeout.js': 'src/ui/audit-closeout.js',
  'js/ui/setup-proposals.js': 'src/ui/setup-proposals.js',
  'js/ui/date-inputs.js': 'src/ui/date-inputs.js',
  'js/ui/config-modal.js': 'src/ui/config-modal.js',
  'js/ui/playground.js': 'src/ui/playground.js',
  'js/ui/new-semester-batch.js': 'src/ui/new-semester-batch.js',
  'js/ui/users-admin.js': 'src/ui/users-admin.js',
  'js/ui/clinical-sites-tab.js': 'src/ui/clinical-sites-tab.js',
  'js/ui/playground-import.js': 'src/ui/playground-import.js',
  'js/ui/theory-stub.js': 'src/ui/theory-stub.js'
};

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function stripGlobals(src) {
  return src
    .replace(/^\/\* global[^*]*\*\/\s*\n?/gm, '')
    .replace(/^var App = App \|\| \{\};\s*\n?/gm, '')
    .replace(/^App\.UI = App\.UI \|\| \{\};\s*\n?/gm, '');
}

function convertIife(src, moduleName) {
  const iifeRe = new RegExp(
    `App\\.${moduleName}\\s*=\\s*\\(function\\s*\\(\\)\\s*\\{([\\s\\S]*)\\n\\}\\)\\(\\);\\s*$`
  );
  const m = src.match(iifeRe);
  if (!m) return null;
  let body = m[1];
  const returnRe = /\n  return \{([\s\S]*?)\n  \};\s*$/;
  const rm = body.match(returnRe);
  if (!rm) return null;
  body = body.replace(returnRe, '');
  const exportNames = rm[1]
    .split(',')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(':');
      return parts.length > 1 ? parts[0].trim() : line.replace(/:.*/, '').trim();
    });
  return body.trim() + '\n\nexport {\n  ' + exportNames.join(',\n  ') + '\n};\n';
}

function convertFlatAppAssignments(src) {
  const lines = src.split('\n');
  const kept = [];
  const exports = [];
  for (const line of lines) {
    const fnMatch = line.match(/^App\.(\w+)\s*=\s*function/);
    const objMatch = line.match(/^App\.(\w+)\s*=\s*\{/);
    const valMatch = line.match(/^App\.(\w+)\s*=\s*[^f{]/);
    if (fnMatch) {
      kept.push('export function ' + line.slice(4).replace(/^App\.\w+\s*=\s*/, ''));
      exports.push(fnMatch[1]);
    } else if (line.match(/^App\.state\s*=/)) {
      kept.push('export ' + line.slice(4));
    } else if (objMatch && line.includes('App.state')) {
      kept.push('export ' + line.slice(4));
    } else if (line.match(/^App\.\w+\s*=/)) {
      kept.push('export ' + line.slice(4));
    } else {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

function detectModuleName(src) {
  const m = src.match(/App\.(\w+)\s*=\s*\(function/);
  return m ? m[1] : null;
}

function addHeader(comment, body) {
  if (body.trimStart().startsWith('/**')) return body;
  return `/**\n * ${comment}\n */\n\n` + body;
}

const MODULE_COMMENTS = {
  MakeupDisplay: 'Makeup tier CSS classes and slot metadata for UI buttons.',
  CourseDefaults: 'Per-course default config templates (program engineer maintained).',
  UserTemplate: 'Role capability matrix and tab/action permissions.',
  UserData: 'User profile and registry schemas, key hashing, validation.',
  SiteLibrary: 'Program-wide clinical site library catalog and overlay editing.',
  SimFacultyData: 'Sim faculty role assignments schema (separate from semester file).'
};

for (const [rel, dest] of Object.entries(PATH_MAP)) {
  const srcPath = join(ROOT, rel);
  const destPath = join(ROOT, dest);
  let raw = readFileSync(srcPath, 'utf8');
  raw = stripGlobals(raw);

  const modName = detectModuleName(readFileSync(srcPath, 'utf8'));
  let converted;
  if (modName) {
    converted = convertIife(raw, modName);
  }
  if (!converted) {
    converted = convertFlatAppAssignments(raw);
  }

  const comment = MODULE_COMMENTS[modName] || `Migrated from ${rel}.`;
  converted = addHeader(comment, converted);
  ensureDir(destPath);
  writeFileSync(destPath, converted, 'utf8');
  console.log('Converted', rel, '->', dest);
}

console.log('Bulk conversion complete. Large files (data-model, scheduler, setup, main, dashboard) need manual split.');
