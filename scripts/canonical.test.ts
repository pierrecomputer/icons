import { afterAll, describe, expect, test } from 'bun:test';
import { transform } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { IconManifest } from '../../figma/packages/svg-pipeline/src/index.ts';

import { buildFromManifest } from './build-icons.ts';
import { symbolsFromManifest } from './build-sprite.ts';

const root = await mkdtemp(join(tmpdir(), 'pierre-icons-'));
const svgDir = join(root, 'svg');
const outputDir = join(root, 'icons');

const manifest: IconManifest = {
  version: 1,
  icons: [
    {
      name: 'IconFileBadgeGear',
      axes: [
        {
          axis: 'Type',
          prop: 'type',
          numeric: false,
          values: [
            { figma: 'Outline', prop: 'outline' },
            { figma: 'Fill', prop: 'fill' },
            { figma: 'Duo', prop: 'duo' },
          ],
          defaultValue: 'outline',
        },
        {
          axis: 'Size',
          prop: 'size',
          numeric: true,
          values: [
            { figma: '12px', prop: '12' },
            { figma: '16px', prop: '16' },
            { figma: '24px', prop: '24' },
          ],
          defaultValue: '16',
        },
      ],
      variants: [
        {
          key: 'outline-12',
          file: 'outline-12px.svg',
          properties: { Type: 'Outline', Size: '12px' },
        },
        {
          key: 'outline-16',
          file: 'outline-16px.svg',
          properties: { Type: 'Outline', Size: '16px' },
        },
        {
          key: 'outline-24',
          file: 'outline-24px.svg',
          properties: { Type: 'Outline', Size: '24px' },
        },
        {
          key: 'fill-12',
          file: 'fill-12px.svg',
          properties: { Type: 'Fill', Size: '12px' },
        },
        {
          key: 'fill-16',
          file: 'fill-16px.svg',
          properties: { Type: 'Fill', Size: '16px' },
        },
        {
          key: 'fill-24',
          file: 'fill-24px.svg',
          properties: { Type: 'Fill', Size: '24px' },
        },
        {
          key: 'duo-16',
          file: 'duo-16px.svg',
          properties: { Type: 'Duo', Size: '16px' },
        },
      ],
    },
  ],
};

await mkdir(join(svgDir, 'IconFileBadgeGear'), { recursive: true });
await mkdir(outputDir, { recursive: true });
await writeFile(
  join(svgDir, 'IconFileBadgeGear', 'outline-12px.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 12 12">' +
    '<path class="subtract" d="M1 1h10v10H1z" fill="currentColor"/>' +
    '<path d="M4 4h4v4H4z" fill="currentColor"/></svg>'
);
await writeFile(
  join(svgDir, 'IconFileBadgeGear', 'outline-16px.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16" overflow="visible">' +
    '<clipPath id="IconFileBadgeGear-outline-16px-a"><path d="M0 0h16v16H0z" fill="#fff"/></clipPath>' +
    '<path class="subtract" clip-path="url(#IconFileBadgeGear-outline-16px-a)" d="M1 1h16v16H1z" fill="currentColor"/>' +
    '<path d="M4 4h8v8H4z" fill="currentColor"/></svg>'
);
await writeFile(
  join(svgDir, 'IconFileBadgeGear', 'outline-24px.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">' +
    '<path class="subtract" d="M1 1h22v22H1z" fill="currentColor"/>' +
    '<path d="M6 6h12v12H6z" fill="currentColor"/></svg>'
);
await writeFile(
  join(svgDir, 'IconFileBadgeGear', 'fill-12px.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 12 12">' +
    '<path class="subtract" d="M1 1h10v10H1z" fill="currentColor"/>' +
    '<path d="M4 4h4v4H4z" fill="currentColor"/></svg>'
);
await writeFile(
  join(svgDir, 'IconFileBadgeGear', 'fill-16px.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">' +
    '<path class="subtract" d="M1 1h14v14H1z" fill="currentColor"/>' +
    '<path d="M4 4h8v8H4z" fill="currentColor"/></svg>'
);
await writeFile(
  join(svgDir, 'IconFileBadgeGear', 'fill-24px.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">' +
    '<path class="subtract" d="M1 1h22v22H1z" fill="currentColor"/>' +
    '<path d="M6 6h12v12H6z" fill="currentColor"/></svg>'
);
await writeFile(
  join(svgDir, 'IconFileBadgeGear', 'duo-16px.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16">' +
    '<path class="base" opacity=".25" d="M1 1h14v14H1z" fill="currentColor"/>' +
    '<path d="M4 4h8v8H4z" fill="currentColor"/></svg>'
);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('canonical local generation', () => {
  test('regenerates an individual multi-variant React component', async () => {
    expect(await buildFromManifest(svgDir, outputDir, manifest)).toBe(3);
    const source = await readFile(
      join(outputDir, 'IconFileBadgeGear.tsx'),
      'utf-8'
    );
    expect(source).toContain('size?: 12 | 16 | 24');
    expect(source).toContain("overflow: 'visible'");
    expect(source).toContain('useId');
    expect(source).not.toContain('type?:');
    expect(source).not.toContain('badge?:');
    expect(source.match(/className="subtract bg"/g)).toHaveLength(3);
    expect(source.match(/className="fg"/g)).toHaveLength(3);
    expect(source).not.toContain('opacity=');
    const fillSource = await readFile(
      join(outputDir, 'IconFileBadgeGearFill.tsx'),
      'utf-8'
    );
    expect(fillSource).not.toContain('type?:');
    expect(fillSource).toContain('size?: 12 | 16 | 24');
    expect(fillSource.match(/className="subtract bg"/g)).toHaveLength(3);
    expect(fillSource.match(/className="fg"/g)).toHaveLength(3);
    expect(fillSource).not.toContain('opacity=');
    const duoSource = await readFile(
      join(outputDir, 'IconFileBadgeGearDuo.tsx'),
      'utf-8'
    );
    expect(duoSource).not.toContain('type?:');
    expect(duoSource).toContain('className="base bg"');
    expect(duoSource).toContain('className="fg"');
    expect(duoSource).toContain('opacity="0.25"');
    const index = await readFile(join(outputDir, 'index.ts'), 'utf-8');
    expect(index).toContain('IconFileBadgeGearFill');
    expect(index).toContain('IconFileBadgeGearDuo');
    expect(
      (await transform(source, { loader: 'tsx', format: 'esm' })).code
    ).toContain('function IconFileBadgeGear');
  });

  test('generates isolated per-variant sprite symbols', async () => {
    const symbols = await symbolsFromManifest(svgDir, manifest);
    expect(symbols).toHaveLength(7);
    const outline16 = symbols.find((symbol) =>
      symbol.includes('id="file-badge-gear-outline-16"')
    );
    const fill24 = symbols.find((symbol) =>
      symbol.includes('id="file-badge-gear-fill-24"')
    );
    expect(outline16).toContain(
      '<symbol id="file-badge-gear-outline-16" viewBox="0 0 16 16" overflow="visible">'
    );
    expect(outline16).toContain(
      'id="file-badge-gear-outline-16-IconFileBadgeGear-outline-16px-a"'
    );
    expect(fill24).toContain(
      '<symbol id="file-badge-gear-fill-24" viewBox="0 0 24 24">'
    );
    expect(outline16).toContain('class="subtract bg"');
    expect(outline16).toContain('class="fg"');
    expect(outline16).not.toContain('opacity=');
    expect(fill24).toContain('class="subtract bg"');
    expect(fill24).toContain('class="fg"');
    expect(fill24).not.toContain('opacity=');
    const duo16 = symbols.find((symbol) =>
      symbol.includes('id="file-badge-gear-duo-16"')
    );
    expect(duo16).toContain('class="base bg"');
    expect(duo16).toContain('class="fg"');
    expect(duo16).toContain('opacity=".25"');
  });
});
