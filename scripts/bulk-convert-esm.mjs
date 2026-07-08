/**
 * Convert legacy App.IIFE modules from js/ to proper ES modules in src/.
 * Run: node scripts/bulk-convert-esm.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');

const FILE_MAP = [
  ['js/course-defaults.js', 'src/core/course-defaults.js', 'Per-course default config templates.'],
  ['js/clinical-sites-library.js', 'src/core/clinical-sites-library.js', 'Program-wide clinical site library.'],
  ['js/calendar-engine.js', 'src/core/calendar-engine.js', 'Semester week calendar and holiday logic.'],
  ['js/roster-balance.js', 'src/core/roster-balance.js', 'Clinical/sim group balancing for rosters.'],
  ['js/orientation.js', 'src/core/orientation.js', 'Orientation week detection and labels.'],
  ['js/clinical-sites.js', 'src/core/clinical-sites.js', 'Clinical site assignment per group/week.'],
  ['js/validator.js', 'src/core/validator.js', 'Schedule and roster validation rules.'],
  ['js/feasibility.js', 'src/core/feasibility.js', 'Pre-generation feasibility checks.'],
  ['js/schedule-status.js', 'src/core/schedule-status.js', 'Schedule completeness and status tiers.'],
  ['js/makeup-display.js', 'src/core/makeup-display.js', 'Makeup slot tier styling helpers.'],
  ['js/audit.js', 'src/audit/audit.js', 'Audit lifecycle phase gating.'],
  ['js/audit-snapshot.js', 'src/audit/audit-snapshot.js', 'Audit snapshot data for export.'],
  ['js/audit-export.js', 'src/audit/audit-export.js', 'Audit PDF export.'],
  ['js/proposals.js', 'src/proposals/proposals.js', 'Setup change proposals workflow.'],
  ['js/proposal-format.js', 'src/proposals/proposal-format.js', 'Human-readable proposal diffs.'],
  ['js/setup-draft.js', 'src/proposals/setup-draft.js', 'Setup form draft snapshots.'],
  ['js/storage.js', 'src/storage/semester-storage.js', 'Semester file persistence and IndexedDB cache.'],
  ['js/user-storage.js', 'src/storage/user-storage.js', 'User credential file storage.'],
  ['js/users-registry-storage.js', 'src/storage/users-registry-storage.js', 'Users registry file storage.'],
  ['js/user-directory.js', 'src/storage/user-directory.js', 'Registry lookup helpers.'],
  ['js/playground-storage.js', 'src/storage/playground-storage.js', 'Playground sandbox file I/O.'],
  ['js/clinical-sites-library-storage.js', 'src/storage/clinical-sites-library-storage.js', 'Standalone site library file storage.'],
  ['js/sim-faculty-storage.js', 'src/storage/sim-faculty-storage.js', 'Sim faculty roles file storage.'],
  ['js/permissions.js', 'src/auth/permissions.js', 'Role-based tab and action permissions.'],
  ['js/user-session.js', 'src/auth/user-session.js', 'User sign-in session and gate UI.'],
  ['js/user-data.js', 'src/auth/user-data.js', 'User file and registry data shapes.'],
  ['js/user-template.js', 'src/auth/user-template.js', 'Role templates and capability matrix.'],
  ['js/sim-faculty-data.js', 'src/auth/sim-faculty-data.js', 'Sim faculty role assignments data.'],
  ['js/dashboard-export.js', 'src/export/dashboard-export.js', 'Dashboard Excel export.'],
  ['js/theme.js', 'src/ui/theme.js', 'Light/dark theme preference.'],
  ['js/pwa.js', 'src/pwa.js', 'PWA install prompts and service worker.'],
  ['js/ui/master-calendar.js', 'src/ui/master-calendar.js', 'Master schedule grid tab.'],
  ['js/ui/student-view.js', 'src/ui/student-view.js', 'Per-student schedule view tab.'],
  ['js/ui/sim-roles.js', 'src/ui/sim-roles.js', 'Simulation roles editor tab.'],
  ['js/ui/makeup-finder.js', 'src/ui/makeup-finder.js', 'Makeup slot finder tab.'],
  ['js/ui/audit-closeout.js', 'src/ui/audit-closeout.js', 'Audit closeout workflow tab.'],
  ['js/ui/setup-proposals.js', 'src/ui/setup-proposals.js', 'Setup proposals review panel.'],
  ['js/ui/date-inputs.js', 'src/ui/date-inputs.js', 'Week-bounded date input helpers.'],
  ['js/ui/config-modal.js', 'src/ui/config-modal.js', 'Advanced config modal shortcuts.'],
  ['js/ui/playground.js', 'src/ui/playground.js', 'Playground sandbox tab.'],
  ['js/ui/new-semester-batch.js', 'src/ui/new-semester-batch.js', 'Batch new-semester wizard.'],
  ['js/ui/users-admin.js', 'src/ui/users-admin.js', 'Users registry admin tab.'],
  ['js/ui/clinical-sites-tab.js', 'src/ui/clinical-sites-tab.js', 'Clinical sites library tab.'],
  ['js/ui/playground-import.js', 'src/ui/playground-import.js', 'Import playground into semester.'],
  ['js/ui/theory-stub.js', 'src/ui/theory-stub.js', 'Theory tab placeholder.'],
];

function extractIifeBody(src) {
  let body = src
    .replace(/^\/\* global [^*]*\*\/\s*/m, '')
    .replace(/^var App = App \|\| \{\};\s*/m, '')
    .replace(/^App\.UI = App\.UI \|\| \{\};\s*/m, '')
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '');

  const assignMatch = body.match(/^App\.(?:UI\.)?[\w]+ = \(function \(\) \{\s*/);
  if (!assignMatch) throw new Error('No IIFE assignment found');
  body = body.slice(assignMatch[0].length);

  const returnIdx = body.lastIndexOf('return {');
  if (returnIdx < 0) throw new Error('No return block found');
  const moduleBody = body.slice(0, returnIdx).replace(/\s+$/, '');

  const returnTail = body.slice(returnIdx);
  const innerMatch = returnTail.match(/return\s*\{([\s\S]*)\}\s*;\s*\}\)\(\);?/);
  if (!innerMatch) throw new Error('No return object found');
  const exportNames = [];
  innerMatch[1].split(',').forEach(function (part) {
    const trimmed = part.trim();
    if (!trimmed) return;
    const key = trimmed.split(':')[0].trim();
    if (key) exportNames.push(key);
  });
  if (!exportNames.length) throw new Error('No exports parsed');

  return { moduleBody, exportNames };
}

function buildExportBlock(names, isConst = false) {
  const lines = names.map((n) => `  ${n}${isConst ? '' : ''}`);
  if (isConst) {
    return `export {\n${lines.join(',\n')}\n};`;
  }
  return `export {\n${lines.join(',\n')}\n};`;
}

function convertFile([srcRel, destRel, description]) {
  const srcPath = join(ROOT, srcRel);
  const destPath = join(ROOT, destRel);
  let raw = readFileSync(srcPath, 'utf8');

  let trailing = '';
  const pwaTail = raw.match(/\}\)\(\);\s*\n\nif \(document\.readyState[\s\S]*$/);
  if (pwaTail && destRel === 'src/pwa.js') {
    trailing = '\n\n' + pwaTail[0].replace(/^\}\)\(\);\s*\n\n/, '').replace(/App\.PWA\.init/g, 'init');
    raw = raw.slice(0, pwaTail.index);
  }

  const { moduleBody, exportNames } = extractIifeBody(raw);

  let body = moduleBody;
  if (destRel === 'src/storage/semester-storage.js') {
    body = body.replace(
      /function init\(\) \{\s*/,
      'function init() {\n    onStateChange(function () {\n      if (state.dirty) scheduleAutoSave();\n    });\n    '
    );
  }

  const header = `/**\n * ${description}\n */\n\n`;
  const exports = buildExportBlock(exportNames);
  const out = header + body + '\n\n' + exports + trailing + '\n';

  if (out.split('\n').length > 500) {
    console.warn('WARN >500 lines:', destRel, out.split('\n').length);
  }

  writeFileSync(destPath, out, 'utf8');
  console.log('Converted', destRel, `(${exportNames.length} exports)`);
  return destRel;
}

const converted = FILE_MAP.map(convertFile);
console.log('Done:', converted.length, 'files');
