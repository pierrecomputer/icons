#!/usr/bin/env node
import { readFile, readdir } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';
import { optimize } from 'svgo';
import { fileURLToPath } from 'url';

import type { IconManifest } from './svg-pipeline/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const betaRoot = resolve(projectRoot, process.argv[2] ?? 'beta');
const svgRoot = join(betaRoot, 'svg');

function referencedIds(svg: string): Set<string> {
  const references = new Set<string>();
  for (const match of svg.matchAll(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g)) {
    references.add(match[2]);
  }
  for (const match of svg.matchAll(
    /\b(?:href|xlink:href)=(["'])#([^"']+)\1/g
  )) {
    references.add(match[2]);
  }
  return references;
}

async function svgFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await svgFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.svg')) files.push(path);
  }
  return files;
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const report = (await readFile(join(betaRoot, 'REPORT.md'), 'utf8')).trim();
  if (
    report !== '# SVG export report\n\nEverything selected exported cleanly.'
  ) {
    errors.push('REPORT.md contains export warnings or an unexpected format.');
  }

  const manifest = JSON.parse(
    await readFile(join(svgRoot, 'manifest.json'), 'utf8')
  ) as IconManifest;
  const names = new Set<string>();
  const expectedFiles = new Set<string>();
  let variantCount = 0;

  for (const icon of manifest.icons) {
    if (names.has(icon.name)) errors.push(`Duplicate icon name: ${icon.name}`);
    names.add(icon.name);

    const keys = new Set<string>();
    for (const variant of icon.variants) {
      variantCount += 1;
      if (keys.has(variant.key)) {
        errors.push(`Duplicate variant key: ${icon.name}/${variant.key}`);
      }
      keys.add(variant.key);

      const path = join(svgRoot, icon.name, variant.file);
      expectedFiles.add(resolve(path));
      let svg: string;
      try {
        svg = await readFile(path, 'utf8');
      } catch {
        errors.push(`Missing manifest SVG: ${relative(projectRoot, path)}`);
        continue;
      }

      if (!/<svg\b[^>]*\bviewBox=/.test(svg)) {
        errors.push(`Missing SVG viewBox: ${relative(projectRoot, path)}`);
      }
      try {
        optimize(svg, { plugins: [] });
      } catch (error) {
        errors.push(
          `Malformed SVG ${relative(projectRoot, path)}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      const references = referencedIds(svg);
      for (const match of svg.matchAll(/\sid=(["'])([^"']+)\1/g)) {
        const id = match[2];
        if (/\s/.test(id)) {
          errors.push(
            `Whitespace in SVG id ${id}: ${relative(projectRoot, path)}`
          );
        } else if (!references.has(id)) {
          errors.push(
            `Unreferenced SVG id ${id}: ${relative(projectRoot, path)}`
          );
        }
      }
    }
  }

  for (const path of await svgFiles(svgRoot)) {
    if (!expectedFiles.has(resolve(path))) {
      errors.push(`SVG is not in the manifest: ${relative(projectRoot, path)}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    throw new Error(`Export audit failed with ${errors.length} error(s).`);
  }

  console.log(
    `✓ Export audit passed: ${manifest.icons.length} families, ` +
      `${variantCount} variants`
  );
}

await main();
