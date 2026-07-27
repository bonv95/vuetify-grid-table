# vuetify-grid-table

Spreadsheet-style editable data grid for **Vue 3 + Vuetify** — cell-level
focus, keyboard navigation, Excel-compatible copy/paste, drag-to-reorder rows,
and a Vuetify input behind every cell (text, number, select, autocomplete,
date, checkbox).

<p>
  <a href="https://vuetify-grid-table.vercel.app"><strong>▶ Live demo</strong></a> ·
  <a href="https://www.npmjs.com/package/vuetify-grid-table">npm</a> ·
  <a href="./packages/vuetify-grid-table/README.md">Documentation</a>
</p>

[![npm](https://img.shields.io/npm/v/vuetify-grid-table.svg)](https://www.npmjs.com/package/vuetify-grid-table)
[![license](https://img.shields.io/npm/l/vuetify-grid-table.svg)](./LICENSE)

```bash
npm install vuetify-grid-table
```

```vue
<GridTable v-model="rows" :columns="columns" height="480" @cell-change="onChange" />
```

Full API — props, events, column types, date shorthand, keyboard map, clipboard
behaviour — lives in **[packages/vuetify-grid-table/README.md](./packages/vuetify-grid-table/README.md)**,
which is also the npm page.

## Repository layout

```
packages/vuetify-grid-table/   the published library
demo/                          the Vercel demo site (private)
```

An npm workspace. The demo imports the library **from source** through a Vite
alias, so `npm run dev` hot-reloads library edits with no rebuild step, and the
Vercel build needs no publish-first dance.

## Develop

```bash
npm install
npm run dev          # demo site at http://localhost:5173
```

| Script               | Does                                              |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Demo site in watch mode                           |
| `npm run build`      | Library, then demo                                |
| `npm run build:lib`  | Library only → `packages/vuetify-grid-table/dist` |
| `npm run build:demo` | Demo only → `demo/dist`                           |
| `npm run typecheck`  | `vue-tsc` over both workspaces                    |

## Publish to npm

The version in `packages/vuetify-grid-table/package.json` is the published version;
`prepublishOnly` rebuilds and type-checks, so a broken build cannot ship.

```bash
npm login                                   # once
npm version patch -w vuetify-grid-table     # or minor / major
npm run release                             # build + publish --access public
git push --follow-tags
```

`npm pack --dry-run -w vuetify-grid-table` prints the exact tarball contents
first if you want to check before pushing a version.

CI can do it instead: `.github/workflows/release.yml` publishes on any `v*`
tag, given an `NPM_TOKEN` repository secret (an npm **Automation** token).

## Deploy the demo to Vercel

`vercel.json` at the repo root already describes the build, so importing the
repository is enough — leave **Root Directory** at the repository root and do
not override the build settings.

```
Framework Preset   Other
Install Command    npm install     (from vercel.json)
Build Command      npm run build   (from vercel.json)
Output Directory   demo/dist       (from vercel.json)
```

Or from the CLI:

```bash
npx vercel            # preview deployment
npx vercel --prod     # production
```

The demo is deployed at **https://vuetify-grid-table.vercel.app**, the URL referenced in
both READMEs. Vercel derives the domain from the project name, so renaming the
project changes the domain — update the demo link here and in
`packages/vuetify-grid-table/README.md` if that happens.

## License

MIT
