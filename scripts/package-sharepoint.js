/**

 * Production build + SharePoint upload package.

 * Copies dist/ → sharepoint-package/ClinSimApp/

 * Copies existing mock-onedrive/ → sharepoint-package/ProgramData/ (no reseed).

 *

 * Optional absolute asset URLs (if relative paths break on your tenant):

 *   $env:SHAREPOINT_BASE_URL="https://tenant.sharepoint.com/sites/Team/Shared%20Documents/ClinSimApp/"

 *   npm run build:sharepoint

 */



import { spawnSync } from 'child_process';

import fs from 'fs';

import path from 'path';

import { fileURLToPath } from 'url';



var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

var pkgDir = path.join(root, 'sharepoint-package');

var appDir = path.join(pkgDir, 'ClinSimApp');

var dataDir = path.join(pkgDir, 'ProgramData');

var mockSrc = path.join(root, 'mock-onedrive');

var distDir = path.join(root, 'dist');



var BASE_PATCH = [

  '<script>',

  '/* sharepoint-base-patch: resolve assets when index.html is opened by direct URL */',

  '(function () {',

  '  try {',

  '    var href = location.href.split("#")[0].split("?")[0];',

  '    if (!/\\.html$/i.test(href)) return;',

  '    var slash = href.lastIndexOf("/");',

  '    if (slash <= 0) return;',

  '    var base = document.createElement("base");',

  '    base.href = href.slice(0, slash + 1);',

  '    document.head.insertBefore(base, document.head.firstChild);',

  '  } catch (err) { /* ignore */ }',

  '})();',

  '</script>'

].join('\n');



function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
    console.warn('Could not remove ' + dir + ' (' + err.code + '). Overwriting files in place.');
  }
}

function syncTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}



function patchIndexHtml(targetDir) {

  var indexPath = path.join(targetDir, 'index.html');

  if (!fs.existsSync(indexPath)) return;

  var html = fs.readFileSync(indexPath, 'utf8');

  if (html.indexOf('sharepoint-base-patch') >= 0) return;

  var needle = '<script type="module"';

  if (html.indexOf(needle) < 0) return;

  html = html.replace(needle, BASE_PATCH + '\n  ' + needle);

  fs.writeFileSync(indexPath, html, 'utf8');

}



function verifyAppBundle(targetDir) {

  var assetsDir = path.join(targetDir, 'assets');

  if (!fs.existsSync(assetsDir)) {

    console.error('ClinSimApp/assets/ missing — build may have failed.');

    process.exit(1);

  }

  var js = fs.readdirSync(assetsDir).filter(function (f) { return f.endsWith('.js') && f.startsWith('index-'); });

  var css = fs.readdirSync(assetsDir).filter(function (f) { return f.endsWith('.css'); });

  if (!js.length || !css.length) {

    console.error('ClinSimApp/assets/ is missing bundled JS or CSS.');

    process.exit(1);

  }

}



function writeUploadGuide() {

  var text = `# SharePoint upload package



Generated for college Teams / SharePoint deployment. **Do not commit this folder to Git** — it contains program data JSON files.



## Folder layout



| Folder | Upload to SharePoint |

|--------|----------------------|

| **ClinSimApp/** | App shell (PWA) — upload **the entire folder** including \`assets/\`, \`icons/\`, \`sw.js\` |

| **ProgramData/** | Team master data — upload to a separate library folder |



## Critical: how to open the app



The app is a **built** site (bundled JS + CSS). These methods **do not work** and show unstyled HTML only:



- Double-clicking \`index.html\` in File Explorer (\`file://\` — browsers block module scripts)

- Opening the **project source** \`index.html\` at the repo root (use \`sharepoint-package/ClinSimApp/\` or \`npm run dev\`)

- Uploading **only** \`index.html\` without the \`assets/\` folder

- SharePoint **preview pane** / \`doc.aspx\` viewer (breaks script and asset paths)



### Local test (before SharePoint)



\`\`\`powershell

npm run preview:sharepoint

\`\`\`



Open http://localhost:4173 — you should see the full styled UI.



### SharePoint



1. Upload the **entire** \`ClinSimApp\` folder (drag folder into the library).

2. In the library, open \`index.html\` → **⋯** → **Copy link** (or **Open in new tab**).

3. The browser address bar must end with \`.../ClinSimApp/index.html\` (not \`doc.aspx\`).

4. Open that URL in **Chrome** or **Edge**.



If styles are still missing, rebuild with your library’s absolute URL:



\`\`\`powershell

$env:SHAREPOINT_BASE_URL="https://YOUR-TENANT.sharepoint.com/sites/YOUR-SITE/Shared%20Documents/ClinSimApp/"

npm run build:sharepoint

\`\`\`



Then re-upload **ClinSimApp** only.



### Fallback: host app on GitHub Pages



Many tenants block scripts in document libraries. You can host **ClinSimApp** on GitHub Pages (already supported) and keep **ProgramData** JSON files in SharePoint. Link faculty to the GitHub Pages URL from your team home page.



## First-time setup in the app



1. **Connect users registry…** → \`ProgramData/users/users-registry.json\`

2. **Load user file…** → e.g. \`ProgramData/users/engineer.user.json\`

3. **Connect OneDrive file** (desktop) or **Open semester file…** (iPad) → \`ProgramData/semesters/F2026_REGN_program.json\`



## Updating the app later



\`npm run build:sharepoint\` → replace files in SharePoint **ClinSimApp** (keep ProgramData).

`;

  fs.writeFileSync(path.join(pkgDir, 'UPLOAD.md'), text, 'utf8');

}



if (!fs.existsSync(mockSrc)) {

  console.error('mock-onedrive/ not found. Run npm run seed:mock-onedrive once, or copy your program data into mock-onedrive/ before packaging.');

  process.exit(1);

}



var buildEnv = Object.assign({}, process.env, { VITE_DEPLOY_BASE: './' });

if (process.env.SHAREPOINT_BASE_URL) {

  console.log('Building with absolute SharePoint base:', process.env.SHAREPOINT_BASE_URL);

  buildEnv.VITE_DEPLOY_BASE = process.env.SHAREPOINT_BASE_URL;

} else {

  console.log('Building app with relative base (./)...');

}



var build = spawnSync('npx', ['vite', 'build'], {

  cwd: root,

  env: buildEnv,

  stdio: 'inherit',

  shell: true

});

if (build.status !== 0) process.exit(build.status || 1);



if (!fs.existsSync(distDir)) {

  console.error('dist/ missing after build.');

  process.exit(1);

}



console.log('Packaging sharepoint-package/...');
fs.mkdirSync(pkgDir, { recursive: true });
rmDir(dataDir);
syncTree(distDir, appDir);

patchIndexHtml(appDir);

verifyAppBundle(appDir);

syncTree(mockSrc, dataDir);

writeUploadGuide();



console.log('');

console.log('SharePoint package ready:');

console.log('  ' + pkgDir);

console.log('  ClinSimApp/   — upload as PWA app (entire folder)');

console.log('  ProgramData/  — upload as team master JSON');

console.log('  UPLOAD.md     — setup + troubleshooting');

console.log('');

console.log('Local test: npm run preview:sharepoint  →  http://localhost:4173');


