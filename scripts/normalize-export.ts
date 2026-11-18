#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { optimize } from 'svgo';
import { fileURLToPath } from 'url';

import { SVGOConfig } from '../svgo.config.js';

import type { IconManifest } from './svg-pipeline/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const betaRoot = resolve(projectRoot, process.argv[2] ?? 'beta');
const svgRoot = join(betaRoot, 'svg');
const manifest = JSON.parse(
  await readFile(join(svgRoot, 'manifest.json'), 'utf8')
) as IconManifest;

let changed = 0;
for (const icon of manifest.icons) {
  for (const variant of icon.variants) {
    const path = join(svgRoot, icon.name, variant.file);
    const source = await readFile(path, 'utf8');
    const normalized = optimize(source, SVGOConfig).data;
    if (normalized === source) continue;
    await writeFile(path, normalized);
    changed += 1;
  }
}

console.log(
  `✓ Normalized ${manifest.icons.length} families; ${changed} SVGs changed`
);
