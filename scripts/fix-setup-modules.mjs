import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function patch(rel, fn) {
  const p = join(ROOT, rel);
  let s = readFileSync(p, 'utf8');
  const out = fn(s);
  if (out !== s) {
    writeFileSync(p, out, 'utf8');
    console.log('patched', rel);
  }
}

const idx = readFileSync(join(ROOT, 'src/ui/setup/index.js'), 'utf8');
const m = idx.match(/function renderScheduleWarnings\(data\) \{[\s\S]*?\n  \}\n\nfunction render\(data\)/);
if (m) {
  const warnFn = m[0].replace(/\n\nfunction render\(data\)$/, '');
  let sem = readFileSync(join(ROOT, 'src/ui/setup/semester-fields.js'), 'utf8');
  if (!sem.includes('renderScheduleWarnings')) {
    const block = warnFn.replace(/^function/, 'export function');
    sem = sem.replace(
      "import { init as initDateInputs } from '../date-inputs.js';",
      "import { init as initDateInputs } from '../date-inputs.js';\nimport * as ScheduleStatus from '../../core/schedule-status.js';\nimport { escHtml } from './dom-utils.js';"
    );
    sem = sem.replace('export function collectSemesterMeta', block + '\n\nexport function collectSemesterMeta');
    writeFileSync(join(ROOT, 'src/ui/setup/semester-fields.js'), sem, 'utf8');
    let newIdx = idx.replace(warnFn + '\n\n', '');
    newIdx = newIdx.replace(
      'renderSemesterFields, updateFinalizeButtonState, updateStartDateFromSeasonYear',
      'renderSemesterFields, updateFinalizeButtonState, updateStartDateFromSeasonYear, renderScheduleWarnings'
    );
    writeFileSync(join(ROOT, 'src/ui/setup/index.js'), newIdx, 'utf8');
    console.log('moved renderScheduleWarnings');
  }
}

const files = [
  'src/ui/setup/index.js',
  'src/ui/setup-config/index.js',
  'src/ui/setup-config/clinical-groups.js',
  'src/ui/setup-config/actions.js',
  'src/ui/dashboard/index.js',
  'src/ui/dashboard/chart.js'
];

for (const f of files) {
  patch(f, (s) => {
    let out = s;
    out = out.replace(/if \(!panel \|\| !App\.ScheduleStatus\) return;/g, 'if (!panel) return;');
    out = out.replace(/if \(opts && opts\.configBefore !== undefined && App\.UI\.SetupConfig\) \{/g, 'if (opts && opts.configBefore !== undefined) {');
    out = out.replace(/if \(App\.UI\.SetupConfig\) SetupConfig\./g, 'SetupConfig.');
    out = out.replace(/if \(App\.UI\.SetupConfig && SetupConfig\./g, 'if (SetupConfig.');
    out = out.replace(/if \(App\.UI\.DateInputs\) \{\s*/g, '{');
    out = out.replace(/if \(App\.UI\.SetupProposals\) /g, '');
    out = out.replace(/if \(App\.UI\.updateSemesterDisplay\) /g, '');
    out = out.replace(/if \(App\.ScheduleStatus\) \{\s*/g, '{');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.resolveSetupData\) return Setup\.resolveSetupData\(\);/g, 'if (Setup.resolveSetupData) return Setup.resolveSetupData();');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.setupAfterChange\) \{/g, 'if (Setup.setupAfterChange) {');
    out = out.replace(/if \(App\.UI\.Setup\) Setup\.render\(data\);/g, 'Setup.render(data);');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.markSetupDraft\) Setup\.markSetupDraft\(data\);/g, 'Setup.markSetupDraft(data);');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.collectFromFormInto\) \{/g, 'if (Setup.collectFromFormInto) {');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.collectFromForm\) \{/g, 'if (Setup.collectFromForm) {');
    out = out.replace(/var before = App\.UI\.Setup && Setup\.collectFromForm/g, 'var before = Setup.collectFromForm');
    out = out.replace(/if \(!select \|\| !App\.CourseDefaults\) return;/g, 'if (!select) return;');
    out = out.replace(/if \(!data \|\| !App\.DashboardExport\) return;/g, 'if (!data) return;');
    out = out.replace(/if \(!canvas \|\| false\) return;/g, 'if (!canvas) return;');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.markSetupDraft\) touchSetupEdit/g, 'touchSetupEdit');
    out = out.replace(/var facId = App\.UI\.Setup\s+\? Setup\.getCohortFacilityIdForGroup\(data, group\)\s+: null;/g,
      'var facId = Setup.getCohortFacilityIdForGroup(data, group);');
    out = out.replace(/var facilityHtml = App\.UI\.Setup\s+\? Setup\.cohortFacilitySelectHtml\(data, group, facId\)\s+: '';/g,
      'var facilityHtml = Setup.cohortFacilitySelectHtml(data, group, facId);');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.weekSelectHtml\) \{/g, 'if (Setup.weekSelectHtml) {');
    out = out.replace(/if \(App\.UI\.Setup && Setup\.semesterWeekHintForIndex\) \{/g, 'if (Setup.semesterWeekHintForIndex) {');
    return out;
  });
}

for (const f of files.concat(['src/ui/setup/semester-fields.js'])) {
  const lines = readFileSync(join(ROOT, f), 'utf8').split('\n').length;
  console.log(f, lines, 'lines');
}
