# How this PWA displays and deploys to GitHub Pages

Brief reference for how Clinical & Simulation Management is built, served, and published — useful when setting up similar projects where CSS/JS fail to load on GitHub Pages.

Live URL: https://prof-parker.github.io/Clinical-and-Simulation-Management/

## How the page loads

1. **Dev:** Vite serves `index.html`. The only app entry is:

   ```html
   <script type="module" src="/src/main.js"></script>
   ```

2. **CSS is not linked in HTML.** `src/main.js` imports it:

   ```javascript
   import '../css/app.css';
   import '../css/print.css';
   import '../css/audit-print.css';
   ```

3. **Production:** `npm run build` bundles JS + CSS into `dist/`, and Vite rewrites asset URLs using `base`.

Opening the raw `index.html` (or the repo root on Pages without a build) gives unstyled HTML — that is why the page includes a “wrong entry” warning.

## Deployment to GitHub Pages

On every push to `main`, [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml):

1. Runs `npm ci` → `npm test` → `npm run build`
2. Deploys **`dist/`** to the **`gh-pages`** branch (JamesIves `github-pages-deploy-action`)
3. Repo Pages is configured as: **branch `gh-pages` / folder `/ (root)`**

`public/.nojekyll` is included so GitHub does not treat the site as Jekyll and ignore folders like `_assets`.

### First-time Pages setup

1. In **Settings → Actions → General → Workflow permissions**, select **Read and write permissions**, then Save.
2. Wait for the **Deploy GitHub Pages** workflow to finish on `main` (creates the `gh-pages` branch automatically — do not create it manually).
3. Open **Repository Settings → Pages**.
4. Under **Build and deployment → Source**, select **Deploy from a branch** (not GitHub Actions).
5. Set **Branch:** `gh-pages` and **Folder:** `/ (root)`, then **Save**.

## The important bit for project Pages sites

In [`vite.config.js`](../vite.config.js):

```js
base: command === 'serve'
  ? '/'
  : (process.env.VITE_DEPLOY_BASE || '/Clinical-and-Simulation-Management/'),
```

- Locally: `base` is `/`
- On Pages: `base` is **`/Clinical-and-Simulation-Management/`** (the repo name)

That makes built asset tags look like `/Clinical-and-Simulation-Management/assets/index-….js` instead of `/assets/…`. Without that, the browser requests `https://user.github.io/assets/...` and gets 404s — the page shows, but CSS/JS do not.

## Checklist for similar projects

| Check | Why |
|--------|-----|
| Deploy the **build output** (`dist/`), not source | Source `index.html` points at `/src/main.js` |
| Set Vite `base` to `/Your-Repo-Name/` (or `./` for relative paths) | Project sites are not at domain root |
| Pages source = the branch that contains the built site | Often `gh-pages` with `/ (root)` |
| Prefer relative or base-aware asset paths | Absolute `/css/app.css` breaks on project Pages |
| Add `.nojekyll` if you have underscored folders | Jekyll can skip them |

## Related docs

- [README.md](../README.md) — GitHub Pages deployment section
- [vite.config.js](../vite.config.js) — `base` + `vite-plugin-pwa`
- [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) — CI deploy pipeline
