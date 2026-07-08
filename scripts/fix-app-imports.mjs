/**
 * Replaces App.X references with explicit imports across all src JS files.
 * Run: node scripts/fix-app-imports.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

/** App namespace key -> module path relative to src/ */
const MODULE_PATHS = {
  DataModel: 'core/data-model/index.js',
  Scheduler: 'core/scheduler/index.js',
  CourseDefaults: 'core/course-defaults.js',
  SiteLibrary: 'core/clinical-sites-library.js',
  CalendarEngine: 'core/calendar-engine.js',
  RosterBalance: 'core/roster-balance.js',
  Orientation: 'core/orientation.js',
  ClinicalSites: 'core/clinical-sites.js',
  Validator: 'core/validator.js',
  Feasibility: 'core/feasibility.js',
  ScheduleStatus: 'core/schedule-status.js',
  MakeupDisplay: 'core/makeup-display.js',
  Audit: 'audit/audit.js',
  AuditSnapshot: 'audit/audit-snapshot.js',
  AuditExport: 'audit/audit-export.js',
  DashboardExport: 'export/dashboard-export.js',
  ProposalFormat: 'proposals/proposal-format.js',
  Proposals: 'proposals/proposals.js',
  SetupDraft: 'proposals/setup-draft.js',
  Storage: 'storage/semester-storage.js',
  UserStorage: 'storage/user-storage.js',
  UsersRegistryStorage: 'storage/users-registry-storage.js',
  UserDirectory: 'storage/user-directory.js',
  PlaygroundStorage: 'storage/playground-storage.js',
  ClinicalSitesLibraryStorage: 'storage/clinical-sites-library-storage.js',
  SimFacultyStorage: 'storage/sim-faculty-storage.js',
  UserTemplate: 'auth/user-template.js',
  UserData: 'auth/user-data.js',
  UserSession: 'auth/user-session.js',
  Permissions: 'auth/permissions.js',
  SimFacultyData: 'auth/sim-faculty-data.js',
  Theme: 'ui/theme.js',
  PWA: 'pwa.js'
};

const UI_MODULE_PATHS = {
  'UI.Dashboard': 'ui/dashboard/index.js',
  'UI.MasterCalendar': 'ui/master-calendar.js',
  'UI.StudentView': 'ui/student-view.js',
  'UI.SimRoles': 'ui/sim-roles.js',
  'UI.MakeupFinder': 'ui/makeup-finder.js',
  'UI.AuditCloseout': 'ui/audit-closeout.js',
  'UI.Setup': 'ui/setup/index.js',
  'UI.SetupConfig': 'ui/setup-config/index.js',
  'UI.SetupProposals': 'ui/setup-proposals.js',
  'UI.ConfigModal': 'ui/config-modal.js',
  'UI.Playground': 'ui/playground.js',
  'UI.NewSemesterBatch': 'ui/new-semester-batch.js',
  'UI.UsersAdmin': 'ui/users-admin.js',
  'UI.ClinicalSitesTab': 'ui/clinical-sites-tab.js',
  'UI.PlaygroundImport': 'ui/playground-import.js',
  'UI.TheoryStub': 'ui/theory-stub.js',
  'UI.DateInputs': 'ui/date-inputs.js'
};

const STATE_IMPORTS = new Set([
  'state', 'getData', 'setData', 'getFileRoot', 'setFileRoot', 'notifyChange',
  'notifySimFacultyChange', 'markClean', 'markDirty', 'markSimFacultyClean',
  'onStateChange', 'syncSemesterToFile', 'switchSemester', 'addSemester'
]);

const DIALOG_IMPORTS = new Set([
  'showAlert', 'showConfirm', 'showDialog', 'closeDialog', 'guardEditable',
  'escapeHtml', 'dialogMessageHtml'
]);

const CHROME_IMPORTS = new Set([
  'refresh', 'switchTab', 'updateSemesterDisplay', 'buildSemesterLabelHtml',
  'updateCourseStatusLine', 'updateUserStatusLine', 'refreshSemesterSwitchMenu',
  'closeMenu', 'toggleMenu', 'updateCloseoutBanner', 'initUI', 'toggleDarkMode'
]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (name.endsWith('.js')) files.push(p);
  }
  return files;
}

function relImport(fromFile, toModulePath) {
  const fromDir = dirname(fromFile);
  const target = join(SRC, toModulePath);
  let rel = relative(fromDir, target).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function processFile(filePath) {
  if (filePath.includes('core\\state.js') || filePath.includes('core/state.js')) return;
  if (filePath.includes('main.js')) return;
  if (filePath.includes('ui\\chrome.js') || filePath.includes('ui/chrome.js')) return;
  if (filePath.includes('ui\\dialogs.js') || filePath.includes('ui/dialogs.js')) return;
  if (filePath.includes('ui\\router.js') || filePath.includes('ui/router.js')) return;

  let src = readFileSync(filePath, 'utf8');
  if (!src.includes('App.')) return;

  const imports = new Map();

  function addImport(modulePath, names, namespace) {
    const key = modulePath + (namespace ? '::' + namespace : '');
    if (!imports.has(key)) imports.set(key, { modulePath, names: new Set(), namespace });
    names.forEach((n) => imports.get(key).names.add(n));
  }

  // App.state.xxx -> state.xxx
  src = src.replace(/\bApp\.state\b/g, 'state');

  for (const [key, mod] of Object.entries(MODULE_PATHS)) {
    const re = new RegExp('\\bApp\\.' + key + '\\b', 'g');
    if (re.test(src)) {
      addImport(mod, [], key);
      src = src.replace(new RegExp('\\bApp\\.' + key + '\\.', 'g'), key + '.');
      src = src.replace(new RegExp('\\bApp\\.' + key + '\\b', 'g'), key);
    }
  }

  for (const [key, mod] of Object.entries(UI_MODULE_PATHS)) {
    const ns = key.split('.').pop();
    const re = new RegExp('\\bApp\\.' + key.replace('.', '\\.') + '\\b', 'g');
    if (re.test(src)) {
      addImport(mod, [], ns);
      src = src.replace(new RegExp('\\bApp\\.' + key.replace('.', '\\.') + '\\.', 'g'), ns + '.');
      src = src.replace(new RegExp('\\bApp\\.' + key.replace('.', '\\.') + '\\b', 'g'), ns);
    }
  }

  // App.UI.xxx chrome/dialog functions
  const uiFnRe = /\bApp\.UI\.(\w+)/g;
  let m;
  while ((m = uiFnRe.exec(src)) !== null) {
    const fn = m[1];
    if (DIALOG_IMPORTS.has(fn)) addImport('ui/dialogs.js', [fn], null);
    else if (CHROME_IMPORTS.has(fn)) addImport('ui/chrome.js', [fn], null);
  }
  src = src.replace(/\bApp\.UI\.(\w+)/g, (_, fn) => fn);

  // state functions
  for (const name of STATE_IMPORTS) {
    if (new RegExp('\\bApp\\.' + name + '\\b').test(src)) {
      addImport('core/state.js', [name], null);
    }
  }
  for (const name of STATE_IMPORTS) {
    src = src.replace(new RegExp('\\bApp\\.' + name + '\\b', 'g'), name);
  }

  // Remaining App. references - strip guard patterns
  src = src.replace(/\bApp\s*&&\s*/g, '');
  src = src.replace(/if\s*\(\s*(\w+)\s*&&\s*\1\.(\w+)\s*\)/g, 'if ($1.$2)');
  src = src.replace(/\bApp\.\w+/g, (match) => {
    console.warn(filePath, 'unresolved:', match);
    return match;
  });

  if (!imports.size) return;

  const importLines = [];
  for (const { modulePath, names, namespace } of imports.values()) {
    const rel = relImport(filePath, modulePath);
    if (namespace) {
      importLines.push(`import * as ${namespace} from '${rel}';`);
    } else if (names.size) {
      importLines.push(`import { ${[...names].sort().join(', ')} } from '${rel}';`);
    }
  }

  const headerEnd = src.match(/^(\/\*\*[\s\S]*?\*\/\s*\n)?/)[0] || '';
  const rest = src.slice(headerEnd.length);
  src = headerEnd + importLines.sort().join('\n') + (importLines.length ? '\n\n' : '') + rest;

  writeFileSync(filePath, src, 'utf8');
  console.log('Fixed', relative(ROOT, filePath));
}

walk(SRC).forEach(processFile);
console.log('Import fix complete.');
