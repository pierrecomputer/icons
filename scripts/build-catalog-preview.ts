#!/usr/bin/env node
import { build as buildBundle } from 'esbuild';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { loadFamilies } from './build-family-preview.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function build(): Promise<void> {
  console.log('Building layout-based icon catalog preview...\n');
  const [families, bundle, layoutStyles, styles] = await Promise.all([
    loadFamilies(),
    buildBundle({
      bundle: true,
      entryPoints: [join(__dirname, 'catalog-preview', 'app.tsx')],
      format: 'iife',
      minify: true,
      platform: 'browser',
      target: 'chrome120',
      write: false,
    }),
    readFile(
      join(projectRoot, 'vendor', 'pierre-layouts', 'src', 'styles.css'),
      'utf-8'
    ),
    readFile(join(__dirname, 'catalog-preview', 'styles.css'), 'utf-8'),
  ]);
  const data = JSON.stringify(families).replace(/</g, '\\u003c');
  const script = bundle.outputFiles[0].text.replace(
    /<\/script/gi,
    '<\\/script'
  );
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@pierre/icons Catalog</title>
    <style>${layoutStyles}\n${styles}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__PIERRE_ICON_FAMILIES__=${data};</script>
    <script>${script}</script>
  </body>
</html>`;
  const output = join(projectRoot, 'dist', 'catalog.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(
    `✓ Generated ${families.length} icon families at dist/catalog.html`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  build().catch((error) => {
    console.error(`Build failed: ${error}`);
    process.exit(1);
  });
}
