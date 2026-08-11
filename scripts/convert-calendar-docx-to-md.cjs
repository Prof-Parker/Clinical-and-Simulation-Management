/**
 * One-off converter: Detailed REGN15/15P Word calendar → structured markdown.
 * Usage: node scripts/convert-calendar-docx-to-md.js
 */
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcRel = path.join(
  root,
  'docs/Design Docs/protypes/Detailed REGN15 15P Calendar Fall 2026 R8-7-26.docx'
);
const outRel = path.join(
  root,
  'docs/Design Docs/protypes/Detailed REGN15 15P Calendar Fall 2026 R8-7-26.md'
);

const tmp = path.join(os.tmpdir(), 'docx_to_md_' + Date.now());
fs.mkdirSync(tmp);
execSync('unzip -q ' + JSON.stringify(srcRel) + ' -d ' + JSON.stringify(tmp));
const xml = fs.readFileSync(path.join(tmp, 'word/document.xml'), 'utf8');

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function cleanText(t) {
  return t
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\*{2,}/g, '')
    .replace(/`+/g, '')
    .trim();
}

function analyzeRun(chunk) {
  const underlined = /<w:u[\s/>]/.test(chunk) && !/<w:u\s+w:val="none"/.test(chunk);
  const hl = (chunk.match(/<w:highlight[^>]*w:val="([^"]+)"/) || [])[1] || null;
  const color = ((chunk.match(/<w:color[^>]*w:val="([^"]+)"/) || [])[1] || '').toUpperCase() || null;
  // Do not trim: Word often puts the only space at a run boundary ("August " + "24").
  const texts = [...chunk.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) =>
    decode(m[1]).replace(/\u00a0/g, ' ')
  );
  const text = texts.join('');
  return { text, underlined, hl, color };
}

function paraInfo(pXml) {
  const runs = pXml
    .split(/<w:r[ >]/)
    .slice(1)
    .map((run) => {
      const end = run.indexOf('</w:r>');
      return analyzeRun(end >= 0 ? run.slice(0, end) : run);
    })
    .filter((r) => r.text.length > 0);

  if (!runs.length) {
    const texts = [...pXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) =>
      decode(m[1]).replace(/\u00a0/g, ' ')
    );
    const text = cleanText(texts.join(''));
    return text ? [{ text, underlined: false, hl: null, color: null }] : [];
  }

  const pHl = (pXml.match(/<w:pPr[\s\S]*?<w:highlight[^>]*w:val="([^"]+)"/) || [])[1] || null;
  return runs.map((r) => ({ ...r, hl: r.hl || pHl }));
}

function mergeParaRuns(runs) {
  const text = cleanText(runs.map((r) => r.text).join(''));
  if (!text) return null;
  const underlined = runs.some((r) => r.underlined);
  const hls = runs.map((r) => r.hl).filter(Boolean);
  const colors = runs.map((r) => r.color).filter((c) => c && c !== '000000' && c !== 'AUTO');
  return { text, underlined, hl: hls[0] || null, color: colors[0] || null };
}

function cellShading(tcXml) {
  const m = tcXml.match(/<w:shd[^>]*w:fill="([^"]+)"/);
  if (!m) return null;
  const fill = m[1].toUpperCase();
  if (fill === 'AUTO' || fill === 'FFFFFF') return null;
  return fill;
}

function cellParas(tcXml) {
  const out = [];
  const parts = tcXml.split(/<w:p[ >]/).slice(1);
  for (const part of parts) {
    const end = part.indexOf('</w:p>');
    const pXml = end >= 0 ? part.slice(0, end) : part;
    const merged = mergeParaRuns(paraInfo(pXml));
    if (merged) out.push(merged);
  }
  return out;
}

function extractElement(src, startIdx, tag) {
  const openTag = '<' + tag;
  const closeTag = '</' + tag + '>';
  let depth = 0;
  let pos = startIdx;
  let end = -1;
  while (pos < src.length) {
    const no = src.indexOf(openTag, pos);
    const nc = src.indexOf(closeTag, pos);
    if (nc < 0) break;
    if (no >= 0 && no < nc) {
      const ch = src[no + openTag.length];
      if (ch === ' ' || ch === '>') {
        depth++;
        pos = no + openTag.length;
        continue;
      }
    }
    depth--;
    pos = nc + closeTag.length;
    if (depth === 0) {
      end = pos;
      break;
    }
  }
  return { xml: src.slice(startIdx, end), end };
}

function parseTable(tblXml) {
  const rows = [];
  let searchFrom = 0;
  while (true) {
    const m = tblXml.slice(searchFrom).match(/<w:tr[ >]/);
    if (!m) break;
    const abs = searchFrom + m.index;
    const { xml: trXml, end } = extractElement(tblXml, abs, 'w:tr');
    const cells = [];
    let cFrom = 0;
    while (true) {
      const cm = trXml.slice(cFrom).match(/<w:tc[ >]/);
      if (!cm) break;
      const cAbs = cFrom + cm.index;
      const extracted = extractElement(trXml, cAbs, 'w:tc');
      const tcXml = extracted.xml;
      cells.push({
        paras: cellParas(tcXml),
        fill: cellShading(tcXml),
        gridSpan: +(tcXml.match(/<w:gridSpan[^>]*w:val="(\d+)"/) || [])[1] || 1
      });
      cFrom = extracted.end;
    }
    rows.push(cells);
    searchFrom = end;
  }
  return rows;
}

function roleTags(para) {
  const tags = [];
  if (para.underlined) tags.push('skills-checkout');
  if (para.hl === 'green') tags.push('faculty:Busk');
  if (para.hl === 'cyan') tags.push('faculty:Parker');
  if (para.hl === 'yellow') tags.push('highlight');
  const c = para.color;
  if (c === '7030A0') tags.push('assignment');
  if (c === 'FF0000' || c === 'EE0000') tags.push('test-or-checkout-day');
  if (c === '005E00' || c === '00B050') tags.push('clinical-classroom');
  if (c === '4472C4' || c === '0070C0') tags.push('lecture-blue');
  if (c === '98A7BD' || c === 'BDD6EE' || c === '9CC2E5') tags.push('simulation');
  return tags;
}

function formatParaLine(para) {
  let t = para.text;
  const tags = roleTags(para);
  if (para.underlined) t = t + ' _(formal skills checkout)_';
  const show = tags.filter((x) => !x.startsWith('faculty:') && x !== 'skills-checkout');
  if (show.length) return '- ' + t + ' `' + show.join(', ') + '`';
  return '- ' + t;
}

const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)[1];
const blocks = [];
{
  let pos = 0;
  while (pos < body.length) {
    const nextP = body.indexOf('<w:p', pos);
    const nextT = body.indexOf('<w:tbl', pos);
    if (nextP < 0 && nextT < 0) break;
    let which;
    if (nextP < 0) which = 'tbl';
    else if (nextT < 0) which = 'p';
    else which = nextP < nextT ? 'p' : 'tbl';
    const idx = which === 'p' ? nextP : nextT;
    // '<w:p' = 4 chars, '<w:tbl' = 6 chars — next char must be space or '>'
    const openLen = which === 'p' ? 4 : 6;
    const ch = body[idx + openLen];
    if (ch !== ' ' && ch !== '>') {
      pos = idx + 1;
      continue;
    }
    const tag = which === 'p' ? 'w:p' : 'w:tbl';
    const { xml: el, end } = extractElement(body, idx, tag);
    if (which === 'p') {
      const merged = mergeParaRuns(paraInfo(el));
      if (merged) blocks.push({ type: 'p', ...merged });
    } else {
      blocks.push({ type: 'table', rows: parseTable(el) });
    }
    pos = end;
  }
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const lines = [];

lines.push('# Detailed REGN15 / 15P Calendar — Fall 2026 (R8-7-26)');
lines.push('');
lines.push('Converted from Word for feature-implementation reference.');
lines.push('');
lines.push('| | |');
lines.push('|---|---|');
lines.push(
  '| **Source** | `docs/Design Docs/protypes/Detailed REGN15 15P Calendar Fall 2026 R8-7-26.docx` |'
);
lines.push(
  '| **Purpose** | Canonical master-week grid for theory + skills/practicum scheduling UI |'
);
lines.push('| **Related design** | `docs/Design Docs/theory_calendar_design.md` |');
lines.push(
  '| **Conversion** | Structured extraction of calendar table, hours table, and color-coding guide |'
);
lines.push('');
lines.push('## How to read this file');
lines.push('');
lines.push(
  'Each instructional week is a **Sun–Sat** header plus two content tracks (when present):'
);
lines.push('');
lines.push(
  '1. **Lecture / theory track** — REGN 15 lectures, quizzes, tests, orientations, sims in the upper content row'
);
lines.push(
  '2. **Clinical / skills track** — REGN 15P Clinical Classroom, skills intro/practice/test, clinical placements, sim finals in the lower content row'
);
lines.push('');
lines.push('Inline annotations from Word styling:');
lines.push('');
lines.push(
  '- `_(formal skills checkout)_` — skill was **underlined** in the source (formal checkout)'
);
lines.push('- `` `assignment` `` — purple text (`#7030A0`)');
lines.push('- `` `test-or-checkout-day` `` — red text (`#FF0000` / `#EE0000`)');
lines.push('- `` `clinical-classroom` `` — green text (`#005E00`)');
lines.push('- `` `simulation` `` — gray-blue text (`#98A7BD`)');
lines.push('- `` `highlight` `` — yellow highlight on a cell or run');
lines.push(
  '- Faculty highlights: **Mr. Busk** = green highlight, **Mr. Parker** = cyan highlight'
);
lines.push('');
lines.push(
  'Faculty names keep source wording; highlight/color tags above are the machine-readable cue.'
);
lines.push('');

let calendarTableSeen = false;
let hoursTableSeen = false;

for (const block of blocks) {
  if (block.type === 'p') {
    const t = block.text;
    if (/^Required and Actual hours$/i.test(t)) {
      lines.push('## Required and actual hours');
      lines.push('');
      continue;
    }
    if (/^Color Coding Guide$/i.test(t)) {
      lines.push('## Color coding guide');
      lines.push('');
      continue;
    }
    if (hoursTableSeen || /^(Mr\.|Module|Assignment|Test|Skills)/i.test(t)) {
      if (/^Mr\. Busk:/i.test(t)) {
        lines.push(
          '- **Mr. Busk** (green highlight): ' + t.replace(/^Mr\.\s*Busk:\s*/i, '')
        );
      } else if (/^Mr\. Parker:/i.test(t)) {
        lines.push(
          '- **Mr. Parker** (cyan highlight): ' + t.replace(/^Mr\.\s*Parker:\s*/i, '')
        );
      } else if (/^Module /i.test(t)) {
        lines.push('- **Module label**: ' + t);
      } else if (/^Assignment:/i.test(t)) {
        lines.push(
          '- **Assignment** (purple `#7030A0`): ' + t.replace(/^Assignment:\s*/i, '')
        );
      } else if (/^Test:/i.test(t)) {
        lines.push('- **Test** (red): ' + t.replace(/^Test:\s*/i, ''));
      } else if (/Skills that will be tested/i.test(t)) {
        lines.push(
          '- **Skills that will be tested** (underline): ' +
            t.replace(/^_*Skills that will be tested_*:?\s*/i, '')
        );
      } else if (/Skills checkout or simulation checkout/i.test(t)) {
        lines.push(
          '- **Skills checkout or simulation checkout** (red): ' +
            t.replace(/^Skills checkout or simulation checkout:\s*/i, '')
        );
      } else {
        lines.push('- ' + t);
      }
      lines.push('');
    } else if (calendarTableSeen) {
      lines.push(t);
      lines.push('');
    }
    continue;
  }

  const rows = block.rows;
  const firstCell =
    (rows[0] && rows[0][0] && rows[0][0].paras[0] && rows[0][0].paras[0].text) || '';
  const isCalendar = /week\s*1/i.test(firstCell) || (rows.length > 20 && rows[0].length >= 7);
  const isHours = /content area/i.test(firstCell);

  if (isCalendar) {
    calendarTableSeen = true;
    lines.push('## Master calendar');
    lines.push('');

    let i = 0;
    while (i < rows.length) {
      const header = rows[i];
      const weekLabelRaw =
        (header[0] && header[0].paras.map((p) => p.text).join(' ')) || '';
      const weekNumMatch = weekLabelRaw.match(/(\d+)/);
      const weekNum = weekNumMatch ? weekNumMatch[1] : '?';
      const isHeader = header[0] && header[0].fill === 'D0CECE';
      if (!isHeader) {
        i++;
        continue;
      }

      const days = [];
      for (let d = 0; d < 7; d++) {
        const cell = header[d + 1] || { paras: [] };
        const texts = cell.paras.map((p) => p.text);
        const dayName = texts.find((t) => dayNames.includes(t)) || dayNames[d];
        const dateText =
          texts.find((t) =>
            /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+/i.test(
              t
            )
          ) || texts.filter((t) => t !== dayName).join(' ');
        const notes = texts.filter((t) => t !== dayName && t !== dateText);
        days.push({ dayName, dateText, notes });
      }

      const range = days[0].dateText + ' – ' + days[6].dateText;
      lines.push('### Week ' + weekNum + ' — ' + range);
      lines.push('');
      if (days.some((d) => d.notes.length)) {
        const specials = days
          .filter((d) => d.notes.length)
          .map((d) => '**' + d.dayName + '**: ' + d.notes.join('; '));
        lines.push('> ' + specials.join(' · '));
        lines.push('');
      }

      let j = i + 1;
      const contentRows = [];
      while (j < rows.length && !(rows[j][0] && rows[j][0].fill === 'D0CECE')) {
        contentRows.push(rows[j]);
        j++;
      }

      for (let d = 0; d < 7; d++) {
        const day = days[d];
        const lectureParas =
          (contentRows[0] && contentRows[0][d + 1] && contentRows[0][d + 1].paras) || [];
        const clinicalParas =
          (contentRows[1] && contentRows[1][d + 1] && contentRows[1][d + 1].paras) || [];
        if (!lectureParas.length && !clinicalParas.length && !day.notes.length) continue;

        const titleNotes = day.notes.length ? ' — ' + day.notes.join('; ') : '';
        lines.push('#### ' + day.dayName + ', ' + day.dateText + titleNotes);
        lines.push('');

        const onlyOne = contentRows.length === 1;
        if (onlyOne) {
          if (lectureParas.length) {
            const idx = lectureParas.findIndex((p) =>
              /clinical classroom|clinical\b|simulation|skills lab|no skills/i.test(p.text)
            );
            if (idx > 0) {
              lines.push('**Lecture / theory track**');
              lines.push('');
              lectureParas.slice(0, idx).forEach((p) => lines.push(formatParaLine(p)));
              lines.push('');
              lines.push('**Clinical / skills track**');
              lines.push('');
              lectureParas.slice(idx).forEach((p) => lines.push(formatParaLine(p)));
              lines.push('');
            } else if (idx === 0) {
              lines.push('**Clinical / skills track**');
              lines.push('');
              lectureParas.forEach((p) => lines.push(formatParaLine(p)));
              lines.push('');
            } else {
              lines.push('**Lecture / theory track**');
              lines.push('');
              lectureParas.forEach((p) => lines.push(formatParaLine(p)));
              lines.push('');
            }
          }
        } else {
          if (lectureParas.length) {
            lines.push('**Lecture / theory track**');
            lines.push('');
            lectureParas.forEach((p) => lines.push(formatParaLine(p)));
            lines.push('');
          }
          if (clinicalParas.length) {
            lines.push('**Clinical / skills track**');
            lines.push('');
            clinicalParas.forEach((p) => lines.push(formatParaLine(p)));
            lines.push('');
          }
        }
      }

      i = j;
    }
    continue;
  }

  if (isHours) {
    hoursTableSeen = true;
    lines.push(
      '| Content area | Clinical practice (real patients) | Clinical observation | Skills labs | Clinical simulation | Total clinical training hours |'
    );
    lines.push('|---|---|---|---|---|---|');
    for (let r = 1; r < rows.length; r++) {
      const cols = [];
      for (let c = 0; c < 6; c++) {
        const cell = rows[r][c] || { paras: [] };
        cols.push(cell.paras.map((p) => p.text).join('<br>').replace(/\|/g, '\\|') || '');
      }
      while (cols.length < 6) cols.push('');
      lines.push('| ' + cols.join(' | ') + ' |');
    }
    lines.push('');
  }
}

const out = lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
fs.writeFileSync(outRel, out, 'utf8');
console.log('wrote', outRel);
console.log('bytes', out.length);
console.log('lines', out.split(/\n/).length);
console.log('weeks', (out.match(/^### Week /gm) || []).length);
console.log('days', (out.match(/^#### /gm) || []).length);
