#!/usr/bin/env node
import { codeToHtml } from '@pierre/highlights';
import pierreDark from '@pierre/highlights/themes/pierre-dark';
import pierreLight from '@pierre/highlights/themes/pierre-light';
import { build as buildBundle } from 'esbuild';
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { format } from 'prettier';
import { optimize } from 'svgo';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  type IconLayerContext,
  addIconLayerClasses,
  iconLayerStyle,
} from '../../figma/packages/svg-pipeline/src/index.ts';
import { SVGOConfig } from '../svgo.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

type Collection = 'current' | 'beta';

interface PreviewIcon {
  collection: Collection;
  componentName: string;
  displayName: string;
  variant: string;
  size: string;
  svg: string;
  sourceSvg: string;
}

/**
 * Convert filename to display name
 */
function toDisplayName(filename: string): string {
  const name = basename(filename, extname(filename));
  // Remove "Icon" prefix for display
  return name.startsWith('Icon') ? name.slice(4) : name;
}

function toReactComponentName(
  componentName: string,
  variantName: string
): string {
  if (variantName === 'outline' || variantName === 'default') {
    return componentName;
  }
  return (
    componentName +
    variantName
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  );
}

/**
 * Process SVG and return optimized content
 */
async function processSvg(
  filePath: string,
  context: IconLayerContext
): Promise<string> {
  const svgContent = await readFile(filePath, 'utf-8');

  const result = optimize(svgContent, SVGOConfig);
  const prepared = result.data.replace(
    /<svg([^>]*)>/,
    (_match, attributes: string) => {
      const attributesWithoutFill = attributes.replace(/\sfill="[^"]*"/, '');
      return `<svg${attributesWithoutFill} fill="currentColor">`;
    }
  );
  return addIconLayerClasses(prepared, context);
}

/**
 * Load the existing flat icon collection.
 */
async function loadCurrentIcons(svgDir: string): Promise<PreviewIcon[]> {
  const files = await readdir(svgDir);
  const svgFiles = files.filter((file) => file.endsWith('.svg')).sort();
  const icons: PreviewIcon[] = [];

  for (const svgFile of svgFiles) {
    try {
      const componentName = basename(svgFile, extname(svgFile));
      const filePath = join(svgDir, svgFile);
      const style = componentName.endsWith('Duo') ? 'duo' : 'outline';
      icons.push({
        collection: 'current',
        componentName,
        displayName: toDisplayName(svgFile),
        variant: 'default',
        size: '24px',
        svg: await processSvg(filePath, {
          componentName: componentName.replace(/Duo$/, ''),
          style,
          hasDuoSibling: style === 'duo',
        }),
        sourceSvg: await readFile(filePath, 'utf-8'),
      });
    } catch (error) {
      console.error(`Error processing ${svgFile}: ${error}`);
    }
  }

  return icons;
}

/**
 * Load the Figma-exported icon collection grouped by component directory.
 */
async function loadVariantIcons(
  svgDir: string,
  collection: Collection
): Promise<PreviewIcon[]> {
  const entries = await readdir(svgDir, { withFileTypes: true });
  const iconDirectories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const icons: PreviewIcon[] = [];

  for (const iconDirectory of iconDirectories) {
    const directoryPath = join(svgDir, iconDirectory.name);
    const files = (await readdir(directoryPath))
      .filter((file) => file.endsWith('.svg'))
      .sort();
    const hasDuoSibling = files.some((file) =>
      /^duo(?:-\d+(?:\.\d+)?px)?\.svg$/.test(file)
    );

    for (const svgFile of files) {
      const variantMatch = /^(.+?)(?:-(\d+(?:\.\d+)?px))?\.svg$/.exec(svgFile);
      if (variantMatch == null) {
        console.warn(
          `Skipping unrecognized beta icon variant: ${iconDirectory.name}/${svgFile}`
        );
        continue;
      }

      const [, variant, size = '16px'] = variantMatch;
      try {
        const filePath = join(directoryPath, svgFile);
        const sourceSvg = await readFile(filePath, 'utf-8');
        const preparedSvg = addIconLayerClasses(sourceSvg, {
          componentName: iconDirectory.name,
          style: iconLayerStyle({ Type: variant }),
          hasDuoSibling,
        });
        icons.push({
          collection,
          componentName: iconDirectory.name,
          displayName: toDisplayName(iconDirectory.name),
          variant,
          size,
          svg: preparedSvg,
          sourceSvg: preparedSvg,
        });
      } catch (error) {
        console.error(
          `Error processing ${iconDirectory.name}/${svgFile}: ${error}`
        );
      }
    }
  }

  return icons;
}

function sortVariants(variants: string[]): string[] {
  const preferredOrder = ['outline', 'fill', 'duo'];
  return variants.sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);

    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

/**
 * Main build function
 */
async function build() {
  console.log('Building icon preview...\n');

  const svgDir = join(projectRoot, 'svg');
  const betaSvgDir = join(projectRoot, 'beta', 'svg');
  const outputDir = join(projectRoot, 'dist');

  // Check if SVG directory exists
  try {
    await stat(svgDir);
  } catch {
    console.log('No SVG directory found');
    return;
  }

  let currentIcons: PreviewIcon[];
  try {
    await stat(join(svgDir, 'manifest.json'));
    currentIcons = await loadVariantIcons(svgDir, 'current');
  } catch {
    currentIcons = await loadCurrentIcons(svgDir);
  }
  let betaIcons: PreviewIcon[] = [];

  try {
    await stat(betaSvgDir);
    betaIcons = await loadVariantIcons(betaSvgDir, 'beta');
  } catch {
    console.log(
      'No beta SVG directory found; building the current collection only'
    );
  }

  if (currentIcons.length === 0 && betaIcons.length === 0) {
    console.log('No SVG files found');
    return;
  }

  const currentIconCount = new Set(
    currentIcons.map((icon) => icon.componentName)
  ).size;
  const betaBaseIconCount = new Set(betaIcons.map((icon) => icon.componentName))
    .size;
  const variants = sortVariants([
    ...new Set(betaIcons.map((icon) => icon.variant)),
  ]);
  const sizes = [...new Set(betaIcons.map((icon) => icon.size))].sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)
  );
  // SVG exports group variant components by their base name. This fill variant
  // is the SVG backing the generated IconSquircleXFill React component.
  const closeIconFill =
    betaIcons.find(
      (icon) =>
        icon.componentName === 'IconSquircleX' &&
        icon.variant === 'fill' &&
        icon.size === '16px'
    ) ??
    betaIcons.find(
      (icon) =>
        icon.componentName === 'IconSquircleX' && icon.variant === 'fill'
    );
  if (closeIconFill == null) {
    throw new Error('IconSquircleXFill SVG is required for the preview');
  }

  console.log(
    `Processing ${currentIconCount} current icons and ${betaBaseIconCount} beta icon families (${betaIcons.length} SVG exports)...`
  );

  const reactSources: Record<string, string> = {};
  for (const [collection, directory] of [
    ['current', join(projectRoot, 'src', 'icons')],
    ['beta', join(projectRoot, 'src', 'beta')],
  ] as const) {
    const files = await readdir(directory);
    for (const file of files.filter(
      (candidate) => candidate.endsWith('.tsx') && candidate !== 'index.ts'
    )) {
      const componentName = basename(file, '.tsx');
      reactSources[`${collection}:${componentName}`] = await readFile(
        join(directory, file),
        'utf-8'
      );
    }
  }

  const svgSources = Object.fromEntries(
    await Promise.all(
      [...currentIcons, ...betaIcons].map(async (icon) => [
        `${icon.collection}:${icon.componentName}:${icon.variant}:${icon.size}`,
        await format(icon.sourceSvg, { parser: 'html' }),
      ])
    )
  );
  const usageSources = Object.fromEntries(
    Object.keys(reactSources).map((key) => {
      const componentName = key.slice(key.indexOf(':') + 1);
      const source = `<${componentName} size={16} />`;
      return [
        componentName,
        new TextDecoder().decode(
          codeToHtml(source, {
            lang: 'tsx',
            themes: { dark: pierreDark, light: pierreLight },
            defaultColor: 'light-dark()',
          })
        ),
      ];
    })
  );
  const sourceData = JSON.stringify({
    react: reactSources,
    svg: svgSources,
    usage: usageSources,
  }).replace(/</g, '\\u003c');
  const bundleResult = await buildBundle({
    bundle: true,
    entryPoints: [join(__dirname, 'preview-diffs.ts')],
    format: 'iife',
    minify: true,
    platform: 'browser',
    target: 'chrome120',
    write: false,
  });
  const diffsBundle = bundleResult.outputFiles[0].text.replace(
    /<\/script/gi,
    '<\\/script'
  );

  const currentIconCards = currentIcons.map(
    ({ componentName, displayName, svg }) => `
      <button
        class="icon-card"
        data-collection="current"
        data-name="${componentName.toLowerCase()}"
        data-variant="default"
        data-sizes="24px"
        data-component-name="${componentName}"
        title="View ${componentName} source"
        type="button"
      >
        <span class="icon-previews">
          <span class="icon-preview" style="--icon-size: 24px">${svg}</span>
        </span>
        <span class="icon-name">${displayName}</span>
      </button>`
  );

  const betaIconGroups = new Map<string, PreviewIcon[]>();
  for (const icon of betaIcons) {
    const key = `${icon.componentName}-${icon.variant}`;
    const group = betaIconGroups.get(key) ?? [];
    group.push(icon);
    betaIconGroups.set(key, group);
  }

  const betaIconCards = [...betaIconGroups.values()].map((icons) => {
    const [{ componentName, variant }] = icons;
    const reactName = toReactComponentName(componentName, variant);
    const displayName = toDisplayName(reactName);
    const availableSizes = icons.map((icon) => icon.size);
    const previews = icons
      .map(
        ({ size, svg }) =>
          `<span class="icon-preview" data-preview-size="${size}" style="--icon-size: ${size}">${svg}</span>`
      )
      .join('');

    return `
      <button
        class="icon-card"
        data-collection="beta"
        data-name="${`${componentName} ${reactName} ${displayName}`.toLowerCase()}"
        data-variant="${variant}"
        data-sizes="${availableSizes.join(',')}"
        data-component-name="${componentName}"
        data-react-component-name="${reactName}"
        aria-label="${reactName}"
        title="View ${reactName} source"
        type="button"
      >
        <span class="icon-previews">${previews}</span>
        <span class="icon-name">${displayName}</span>
      </button>`;
  });
  const betaStyleComponentCount = betaIconCards.length;

  const iconCards = [...currentIconCards, ...betaIconCards];

  const navSections = [
    {
      label: 'Browse',
      items: [{ label: 'Deployments', icon: 'IconBox' }],
    },
    {
      label: 'Activity',
      items: [
        { label: 'Usage', icon: 'IconLineGraph' },
        { label: 'Logs', icon: 'IconFileText' },
        { label: 'Webhooks', icon: 'IconWebhook' },
      ],
    },
    {
      label: 'Developers',
      items: [
        { label: 'Keys', icon: 'IconLock' },
        { label: 'Commit signing keys', icon: 'IconShieldLock' },
        { label: 'Settings', icon: 'IconGear' },
      ],
    },
    {
      label: 'Support',
      items: [
        { label: 'Changelog', icon: 'IconGitBranch' },
        { label: 'Documentation', icon: 'IconFileText' },
        { label: 'Contact Us', icon: 'IconEnvelope' },
        { label: 'Join Slack channel', icon: 'IconComment' },
      ],
    },
  ];

  const navItemCount = navSections.reduce(
    (count, section) => count + section.items.length,
    0
  );

  function buildNavIcon(componentName: string): string {
    const fallback =
      betaIcons.find(
        (icon) =>
          icon.componentName === componentName &&
          icon.variant === 'outline' &&
          icon.size === '16px'
      ) ??
      betaIcons.find(
        (icon) =>
          icon.componentName === componentName && icon.variant === 'outline'
      );

    return sizes
      .map((size) => {
        const icon =
          betaIcons.find(
            (candidate) =>
              candidate.componentName === componentName &&
              candidate.variant === 'outline' &&
              candidate.size === size
          ) ?? fallback;

        return icon == null
          ? ''
          : `<span class="nav-item-icon" data-nav-icon-size="${size}" style="--icon-size: ${size}">${icon.svg}</span>`;
      })
      .join('');
  }

  const navContent = navSections
    .flatMap((section) => section.items)
    .map(
      (item) => `
        <button class="nav-item" type="button">
          <span class="nav-item-icons">${buildNavIcon(item.icon)}</span>
          <span>${item.label}</span>
        </button>`
    )
    .join('');

  const viewControls = [
    { value: 'gallery', label: 'Gallery' },
    { value: 'list', label: 'List' },
  ]
    .map(
      ({ value, label }) =>
        `<button class="control-button" type="button" data-view-control="${value}" aria-pressed="${value === 'gallery'}">${label}</button>`
    )
    .join('');

  const collectionControls = [
    { value: 'current', label: `Current · ${currentIconCount}` },
    { value: 'beta', label: `Beta · ${betaStyleComponentCount}` },
  ]
    .map(
      ({ value, label }) =>
        `<button class="control-button" type="button" data-collection-control="${value}" aria-pressed="${value === 'beta'}">${label}</button>`
    )
    .join('');

  const variantControls = ['all', ...variants]
    .map(
      (variant) =>
        `<button class="control-button" type="button" data-variant-control="${variant}" aria-pressed="${variant === 'all'}">${variant}</button>`
    )
    .join('');

  const sizeControls = ['all', ...sizes]
    .map(
      (size) =>
        `<button class="control-button${size === 'all' ? ' all-size-control' : ''}" type="button" data-size-control="${size}" aria-pressed="${size === '24px'}">${size === 'all' ? 'All' : size.replace('px', '')}</button>`
    )
    .join('');

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>@pierre/icons Preview</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #fff;
      --bg-card: #f9f9f9;
      --bg-card-hover: #f5f5f5;
      --bg-control: #efefef;
      --fg: #333;
      --fg-muted: #777;
      --border: #ddd;
      --popover-border: rgb(0 0 0 / 0.14);
      --segment-selected-bg: #fff;
      --segment-selected-border: rgb(0 0 0 / 0.14);
      --accent: #007bff;
      /* Shared .500 base palette from @pierre/theme@2.0.0 packages/theme/src/palettes.ts. */
      --multi-blue-500: #009fff;
      --multi-green-500: #0dbe4e;
      --multi-pink-500: #fc2b73;
      --multi-purple-500: #c635e4;
      --multi-indigo-500: #7b43f8;
      --multi-violet-500: #a13cee;
      --multi-lime-500: #86c427;
      --multi-teal-500: #00c5d2;
      --multi-cyan-500: #08c0ef;
      --multi-orange-500: #fe8c2c;
      --multi-amber-500: #ffab16;
      --multi-vermillion-500: #ff5d36;
      --multi-red-500: #ff2e3f;
      --radius: 12px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --bg: #0a0a0a;
        --bg-card: #141414;
        --bg-card-hover: #1e1e1e;
        --bg-control: #1c1c1c;
        --fg: #fafafa;
        --fg-muted: #777;
        --border: #262626;
        --popover-border: rgb(255 255 255 / 0.14);
        --segment-selected-bg: #0a0a0a;
        --segment-selected-border: rgb(255 255 255 / 0.14);
        --accent: #2563eb;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, sans-serif;
      margin: 0;
      padding: 2rem;
      color: var(--fg);
      background-color: var(--bg);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      max-width: 1400px;
      margin: 0 auto 1rem;
    }

    h1 {
      margin-block: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }


    .count {
      margin-block: 0;
      color: var(--fg-muted);
      font-size: 0.875rem;
    }

    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
      max-width: 1400px;
      margin: 0 auto 2rem;
    }

    .search {
      box-sizing: border-box;
      width: 280px;
      padding: 9px 1rem;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 18px;
      color: var(--fg);
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      outline: none;
      transition: border-color 0.15s;
    }

    .search:focus {
      border-color: var(--accent);
    }

    .search::placeholder {
      color: var(--fg-muted);
    }

    .control-group {
      display: inline-flex;
      align-items: center;
      padding: 0;
      gap: 0;
      background: var(--bg-control);
      border: 0;
      border-radius: 10px;
    }

    .control-group[hidden] {
      display: none;
    }

    .control-button {
      padding: 10px 11px;
      color: var(--fg-muted);
      font: inherit;
      font-size: 0.75rem;
      line-height: 16px;
      text-transform: capitalize;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 9px;
      box-shadow: none;
      cursor: pointer;
      transition:
        color 0.15s,
        background-color 0.15s,
        border-color 0.15s;
    }

    .control-button + .control-button {
      margin-left: -1px;
    }

    .control-button:hover:not([aria-pressed="true"]):not(:disabled) {
      color: var(--fg);
    }

    .control-button[aria-pressed="true"] {
      position: relative;
      z-index: 1;
      color: var(--fg);
      background: var(--segment-selected-bg);
      border-color: var(--segment-selected-border);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
    }

    .control-button:focus-visible {
      position: relative;
      z-index: 2;
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 1rem;
      max-width: 1400px;
      margin-inline: auto;
    }

    .grid[data-size="all"] {
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    }

    .grid[hidden] {
      display: none;
    }

    .nav-preview {
      --nav-font-size: 13px;
      --nav-font-weight: 500;
      --nav-line-height: 30px;
      display: grid;
      width: min(100%, 420px);
      margin-inline: auto;
      padding: 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
    }

    .nav-preview[hidden] {
      display: none;
    }

    .nav-preview[data-size="12px"] {
      --nav-font-size: 12px;
      --nav-font-weight: 400;
      --nav-line-height: 18px;
    }

    .nav-preview[data-size="16px"] {
      // --nav-font-size: 13px;
      // --nav-font-weight: 500;
      // --nav-line-height: 20px;
    }

    .nav-preview[data-size="24px"] {
      --nav-font-size: 14px;
      --nav-font-weight: 400;
      --nav-line-height: 20px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: calc(var(--nav-line-height) + 1rem);
      gap: 0.625rem;
      padding: 0.5rem 0.75rem;
      color: var(--fg);
      font-family: inherit;
      font-size: var(--nav-font-size);
      font-weight: var(--nav-font-weight);
      line-height: var(--nav-line-height);
      text-align: left;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 10px;
      cursor: pointer;
    }

    .nav-item-icons {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
    }

    .nav-item-icon {
      display: grid;
      color: currentColor;
      place-items: center;
    }

    .nav-item-icon[hidden] {
      display: none;
    }

    .nav-item-icon svg {
      width: var(--icon-size);
      height: var(--icon-size);
    }

    .nav-item-icon svg [stroke] {
      fill: none;
      stroke: currentColor;
    }

    .icon-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 1.5rem 0.5rem;
      color: var(--fg);
      font: inherit;
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
    }

    .icon-card:hover {
      --fg: var(--accent);
      --fg-muted: color-mix(in lab, var(--accent) 75%, transparent);
      background-color: color-mix(in lab, var(--accent) 15%, transparent);
      border-color: var(--accent);
    }

    .icon-card[hidden] {
      display: none;
    }

    .icon-previews {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 40px;
      gap: 0.125rem;
    }

    .icon-preview {
      display: grid;
      width: 32px;
      height: 40px;
      color: inherit;
      place-items: center;
    }

    .icon-preview[hidden] {
      display: none;
    }

    .icon-preview svg {
      width: var(--icon-size);
      height: var(--icon-size);
    }

    .icon-card[data-collection="current"] .icon-preview svg [stroke] {
      fill: none;
    }

    .icon-name {
      display: block;
      font-size: 0.625rem;
      color: var(--fg-muted);
      text-align: center;
      word-break: break-word;
      line-height: 1.3;
    }

    .no-results {
      grid-column: 1 / -1;
      text-align: center;
      color: var(--fg-muted);
      padding: 4rem 1rem;
    }

    .source-popover {
      display: none;
      flex-direction: column;
      width: min(1200px, calc(100vw - 2rem));
      max-width: none;
      height: min(760px, calc(100vh - 2rem));
      max-height: none;
      padding: 0;
      overflow: hidden;
      color: var(--fg);
      background: var(--bg);
      border: 1px solid var(--popover-border);
      border-radius: 16px;
      background-clip: padding-box;
      box-shadow: 0 24px 80px rgb(0 0 0 / 0.25);
    }

    .source-popover:popover-open {
      display: flex;
    }

    .source-popover::backdrop {
      background: rgb(0 0 0 / 0.45);
      backdrop-filter: blur(2px);
    }

    body.source-popover-open > :not(.source-popover) {
      pointer-events: none;
    }

    .source-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 0.75rem 0.75rem 1.25rem;
    }

    .source-title {
      min-width: 0;
    }

    .source-title strong {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source-actions {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 0.5rem;
    }

    .source-close {
      display: grid;
      width: 32px;
      height: 32px;
      padding: 0;
      color: var(--fg-muted);
      font: inherit;
      appearance: none;
      background: none;
      border: 0;
      box-shadow: none;
      cursor: pointer;
      place-items: center;
      transition: color 0.15s;
    }

    .source-close:hover,
    .source-close:focus-visible {
      color: var(--accent);
      outline: none;
    }

    .source-close svg {
      width: 24px;
      height: 24px;
    }

    .source-mode-control,
    .source-variant-controls {
      padding: 0;
      gap: 0;
      background: var(--bg-control);
      border: 0;
      border-radius: 10px;
    }

    .source-mode-button,
    .source-variant-controls .control-button {
      padding: 5px 8px;
      color: var(--fg-muted);
      font-size: 12px;
      line-height: 1.25;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 9px;
      box-shadow: none;
      transition:
        color 0.15s,
        background-color 0.15s,
        border-color 0.15s;
    }

    .source-mode-button + .source-mode-button,
    .source-variant-controls .control-button + .control-button {
      margin-left: -1px;
    }

    .source-mode-button:hover:not([aria-pressed="true"]),
    .source-variant-controls
      .control-button:hover:not([aria-pressed="true"]):not(:disabled) {
      color: var(--fg);
    }

    .source-mode-button[aria-pressed="true"],
    .source-variant-controls .control-button[aria-pressed="true"] {
      position: relative;
      z-index: 1;
      color: var(--fg);
      background: var(--segment-selected-bg);
      border-color: var(--segment-selected-border);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
    }

    .source-mode-button:focus-visible,
    .source-variant-controls .control-button:focus-visible {
      position: relative;
      z-index: 2;
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }

    .source-preview-controls {
      display: flex;
      width: calc(100% - (2 * var(--source-preview-padding)));
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .source-preview-controls[hidden] {
      display: none;
    }

    .source-multi-control {
      display: inline-flex;
      min-height: 27px;
      flex: 0 0 auto;
      align-items: center;
      gap: 0.375rem;
      padding: 0;
      color: var(--fg-muted);
      font-family: inherit;
      font-size: 12px;
      line-height: 1.25;
      appearance: none;
      background: none;
      border: 0;
      cursor: pointer;
      user-select: none;
    }

    .source-multi-control[hidden] {
      display: none;
    }

    .source-multi-control[aria-checked="true"] {
      color: var(--fg);
    }

    .source-multi-control:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .source-multi-track {
      position: relative;
      width: 28px;
      height: 16px;
      flex: 0 0 auto;
      background: var(--border);
      border-radius: 999px;
      box-shadow: inset 0 0 0 1px var(--segment-selected-border);
      transition:
        background-color 0.15s,
        box-shadow 0.15s;
    }

    .source-multi-track::after {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      content: "";
      background: var(--segment-selected-bg);
      border-radius: 50%;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.24);
      transition: transform 0.15s;
    }

    .source-multi-control[aria-checked="true"] .source-multi-track {
      background: var(--accent);
      box-shadow: none;
    }

    .source-multi-control[aria-checked="true"] .source-multi-track::after {
      transform: translateX(12px);
    }

    .source-multi-control:focus-visible {
      outline: none;
    }

    .source-multi-control:focus-visible .source-multi-track {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .source-viewer {
      min-width: 0;
      min-height: 0;
      overflow: auto;
    }

    .source-viewer > diffs-container {
      --diffs-font-size: 13px;
      --diffs-line-height: 20px;
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    .source-popover-content {
      display: grid;
      grid-template-columns: minmax(276px, 33%) minmax(0, 1fr);
      flex: 1 1 auto;
      min-height: 0;
      border-top: 1px solid var(--border);
    }

    .source-preview {
      --source-preview-padding: 2rem;
      --source-usage-padding: 1rem;
      display: flex;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 1.5rem;
      padding-block: var(--source-preview-padding) 0;
      overflow: auto;
      background: var(--bg-card);
      border-right: 1px solid var(--border);
    }

    .source-variant-controls {
      flex: 0 0 auto;
    }

    .source-variant-controls .control-button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .source-variant-controls .control-button[hidden] {
      display: none;
    }

    .source-live-preview {
      display: grid;
      width: min(
        calc(100% - (2 * var(--source-preview-padding))),
        240px
      );
      aspect-ratio: 1;
      color: var(--fg);
      place-items: center;
    }

    .source-live-preview svg {
      width: min(68%, 160px);
      height: min(68%, 160px);
    }

    .source-preview[data-multi="true"] .source-live-preview .bg {
      color: var(--multi-bg);
    }

    .source-preview[data-multi="true"] .source-live-preview .fg {
      color: var(--multi-fg);
    }

    .source-preview[data-collection="current"]
      .source-live-preview
      svg
      [stroke] {
      fill: none;
    }

    .source-usage {
      width: 100%;
      min-width: 0;
      margin-top: auto;
    }

    .source-usage[hidden] {
      display: none;
    }

    .source-usage-group {
      min-width: 0;
    }

    .source-usage-label {
      margin: 0;
      padding: 0.5rem var(--source-usage-padding);
      color: var(--fg);
      font-size: 0.75rem;
      font-weight: 600;
      border-top: 1px solid var(--border);
    }

    .source-usage-group + .source-usage-group .source-usage-label {
      padding-top: 1.25rem;
    }

    .source-usage-example {
      display: grid;
      grid-template-columns: 1.5rem minmax(0, 1fr);
      gap: 0.25rem;
      align-items: center;
      min-width: 0;
      min-height: 2.25rem;
      padding-inline: var(--source-usage-padding);
      border-top: 1px solid var(--border);
    }

    .source-usage-icon {
      display: grid;
      width: 100%;
      min-height: 2.25rem;
      color: var(--fg);
      place-items: center start;
    }

    .source-usage-icon svg {
      width: 16px;
      height: 16px;
      overflow: visible;
    }

    .source-usage-code {
      display: block;
      min-width: 0;
      padding: 0.5rem 0;
      overflow-wrap: anywhere;
      color: var(--fg-muted);
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: normal;
    }

    .source-usage-code .highlights {
      margin: 0;
      overflow: visible;
      color: inherit;
      font: inherit;
      white-space: pre-wrap;
      background: transparent !important;
    }

    .source-usage-code .highlights code {
      font: inherit;
    }

    .source-props-table {
      width: 100%;
      margin-bottom: 0.25rem;
      color: var(--fg-muted);
      font-size: 12px;
      line-height: 1.4;
      table-layout: fixed;
      border-collapse: collapse;
    }

    .source-props-table th,
    .source-props-table td {
      padding: 0.375rem;
      overflow-wrap: anywhere;
      font-weight: 400;
      text-align: left;
      vertical-align: top;
      border-top: 1px solid var(--border);
    }

    .source-props-table th {
      font-weight: 500;
    }

    .source-props-table th:first-child,
    .source-props-table td:first-child {
      width: 32%;
      padding-left: var(--source-usage-padding);
      color: var(--fg);
    }

    .source-props-table th:last-child,
    .source-props-table td:last-child {
      width: 32%;
      padding-right: var(--source-usage-padding);
    }

    .source-props-table code {
      color: inherit;
      font: inherit;
    }

    .source-props-table td:first-child code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .source-fallback {
      min-height: 100%;
      margin: 0;
      padding: 1rem;
      overflow: auto;
      color: var(--fg);
      font: 13px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre;
      tab-size: 2;
    }

    @media (max-width: 720px) {
      body {
        padding: 1rem;
      }

      .source-popover {
        width: calc(100vw - 1rem);
        height: calc(100vh - 1rem);
      }

      .source-popover-header {
        padding-left: 1rem;
      }

      .source-popover-content {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(220px, 45%) minmax(0, 1fr);
      }

      .source-preview {
        --source-preview-padding: 1rem;
        gap: 0.5rem;
        padding-block: var(--source-preview-padding);
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }

      .source-usage {
        margin-top: 0;
      }

      .source-live-preview {
        width: min(100%, 160px);
        min-height: 0;
        flex: 0 0 auto;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>@pierre/icons</h1>
      <p class="count" id="count">${currentIconCount} icons</p>
    </div>
  </div>

  <div class="toolbar">
    <div class="control-group" aria-label="Preview view">
      ${viewControls}
    </div>
    <div class="control-group gallery-control" aria-label="Icon collection">
      ${collectionControls}
    </div>
    <div class="control-group gallery-control beta-control" aria-label="Icon variant" hidden>
      ${variantControls}
    </div>
    <div class="control-group size-control" aria-label="Source size" hidden>
      ${sizeControls}
    </div>
    <input type="search" class="search gallery-control" placeholder="Search icons..." id="search">
  </div>

  <div class="grid" id="grid">
    ${iconCards.join('')}
    <div class="no-results" id="no-results" hidden>No icons found</div>
  </div>

  <div class="nav-preview" id="nav-preview" data-size="16px" hidden>
    ${navContent}
  </div>

  <div class="source-popover" id="source-popover" popover>
    <div class="source-popover-header">
      <div class="source-title">
        <strong id="source-title">Icon source</strong>
      </div>
      <div class="source-actions">
        <button class="source-close" type="button" aria-label="Close icon preview" title="Close icon preview" popovertarget="source-popover" popovertargetaction="hide">${closeIconFill.svg}</button>
      </div>
    </div>
    <div class="source-popover-content">
      <aside class="source-preview" id="source-preview" aria-label="Icon preview">
        <div class="source-preview-controls" id="source-preview-controls" hidden>
          <div class="control-group source-variant-controls" id="source-variant-controls" aria-label="Icon variant">
            <button class="control-button" type="button" data-source-variant="outline" aria-pressed="false">Outline</button>
            <button class="control-button" type="button" data-source-variant="fill" aria-pressed="false">Fill</button>
            <button class="control-button" type="button" data-source-variant="duo" aria-pressed="false">Duo</button>
          </div>
          <button class="source-multi-control" id="source-multi-control" type="button" role="switch" aria-checked="false" hidden>
            <span>Multi</span>
            <span class="source-multi-track" aria-hidden="true"></span>
          </button>
        </div>
        <div class="source-live-preview" id="source-live-preview" aria-hidden="true"></div>
        <section class="source-usage" id="source-usage" aria-label="Icon usage examples" hidden>
          <div id="source-usage-groups"></div>
        </section>
      </aside>
      <div class="source-viewer" id="source-viewer"></div>
    </div>
  </div>

  <script>${diffsBundle}</script>
  <script>
    const sourceData = ${sourceData};
    const search = document.getElementById('search');
    const grid = document.getElementById('grid');
    const navPreview = document.getElementById('nav-preview');
    const navIcons = document.querySelectorAll('[data-nav-icon-size]');
    const cards = document.querySelectorAll('.icon-card');
    const count = document.getElementById('count');
    const noResults = document.getElementById('no-results');
    const galleryControls = document.querySelectorAll('.gallery-control');
    const sizeControl = document.querySelector('.size-control');
    const allSizeControl = document.querySelector('.all-size-control');
    const viewButtons = document.querySelectorAll('[data-view-control]');
    const collectionButtons = document.querySelectorAll('[data-collection-control]');
    const variantButtons = document.querySelectorAll('[data-variant-control]');
    const sizeButtons = document.querySelectorAll('[data-size-control]');
    const sourcePopover = document.getElementById('source-popover');
    const sourceTitle = document.getElementById('source-title');
    const sourcePreview = document.getElementById('source-preview');
    const sourceLivePreview = document.getElementById('source-live-preview');
    const sourcePreviewControls = document.getElementById('source-preview-controls');
    const sourceVariantButtons = document.querySelectorAll('[data-source-variant]');
    const sourceMultiControl = document.getElementById('source-multi-control');
    const sourceUsage = document.getElementById('source-usage');
    const sourceUsageGroups = document.getElementById('source-usage-groups');
    const sourceViewer = document.getElementById('source-viewer');
    let view = 'gallery';
    let collection = 'beta';
    let variant = 'all';
    let size = '${sizes.includes('24px') ? '24px' : (sizes[0] ?? '24px')}';
    let sourceMode = 'react';
    let activeCard = null;
    let activeSourceSize = null;
    let activeSourceVariant = null;
    let sourceMulti = false;
    let fileInstance = null;
    const multiColorPairs = [
      {
        background: 'var(--multi-blue-500)',
        foreground: 'var(--multi-green-500)',
      },
      {
        background: 'var(--multi-pink-500)',
        foreground: 'var(--multi-purple-500)',
      },
      {
        background: 'var(--multi-indigo-500)',
        foreground: 'var(--multi-violet-500)',
      },
      {
        background: 'var(--multi-lime-500)',
        foreground: 'var(--multi-green-500)',
      },
      {
        background: 'var(--multi-teal-500)',
        foreground: 'var(--multi-cyan-500)',
      },
      {
        background: 'var(--multi-orange-500)',
        foreground: 'var(--multi-amber-500)',
      },
      {
        background: 'var(--multi-vermillion-500)',
        foreground: 'var(--multi-red-500)',
      },
    ];
    const multiComponentNames = [
      ...new Set(
        [...cards]
          .filter(
            card =>
              card.dataset.collection === 'beta' &&
              card.dataset.variant === 'duo'
          )
          .map(card => card.dataset.componentName)
      ),
    ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const multiPairIndexByComponent = new Map();

    function mixMultiAssignment(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      hash ^= hash >>> 16;
      hash = Math.imul(hash, 2246822507);
      hash ^= hash >>> 13;
      hash = Math.imul(hash, 3266489909);
      return (hash ^ (hash >>> 16)) >>> 0;
    }

    let previousMultiPairIndex = -1;
    for (
      let offset = 0;
      offset < multiComponentNames.length;
      offset += multiColorPairs.length
    ) {
      const componentBlock = multiComponentNames.slice(
        offset,
        offset + multiColorPairs.length
      );
      const blockSeed = componentBlock.join('|');
      const pairIndexes = multiColorPairs
        .map((_, index) => index)
        .sort((left, right) => {
          const leftHash = mixMultiAssignment(blockSeed + ':' + left);
          const rightHash = mixMultiAssignment(blockSeed + ':' + right);
          return leftHash - rightHash || left - right;
        });

      if (
        pairIndexes.length > 1 &&
        pairIndexes[0] === previousMultiPairIndex
      ) {
        [pairIndexes[0], pairIndexes[1]] = [pairIndexes[1], pairIndexes[0]];
      }

      componentBlock.forEach((componentName, index) => {
        multiPairIndexByComponent.set(componentName, pairIndexes[index]);
      });
      previousMultiPairIndex = pairIndexes[componentBlock.length - 1];
    }

    function setPressed(buttons, activeButton) {
      buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(button === activeButton));
      });
    }

    function setSize(nextSize) {
      size = nextSize;
      sizeButtons.forEach(button => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.sizeControl === size)
        );
      });
    }

    function update() {
      const query = search.value.trim().toLowerCase();
      let visibleCount = 0;

      cards.forEach(card => {
        const matchesCollection = card.dataset.collection === collection;
        const matchesVariant =
          collection === 'current' ||
          ((variant === 'all' || card.dataset.variant === variant) &&
            (size === 'all' || card.dataset.sizes.split(',').includes(size)));
        const matchesSearch = card.dataset.name.includes(query);
        const visible = matchesCollection && matchesVariant && matchesSearch;

        if (card.dataset.collection === 'beta') {
          card.querySelectorAll('[data-preview-size]').forEach(preview => {
            preview.hidden =
              size !== 'all' && preview.dataset.previewSize !== size;
          });

          const sizeContext =
            size === 'all'
              ? card.dataset.sizes.split(',').join(' / ')
              : size;
          const reactName = card.dataset.reactComponentName;
          card.setAttribute('aria-label', reactName + ' · ' + sizeContext);
          card.title = 'View ' + reactName + ' source · ' + sizeContext;
        }

        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      noResults.hidden = visibleCount !== 0;
      grid.dataset.size = collection === 'beta' ? size : 'current';
      grid.hidden = view !== 'gallery';
      navPreview.hidden = view !== 'list';

      navPreview.dataset.size = size;
      navIcons.forEach(icon => {
        icon.hidden = icon.dataset.navIconSize !== size;
      });

      galleryControls.forEach(control => {
        control.hidden =
          view !== 'gallery' ||
          (control.classList.contains('beta-control') &&
            collection !== 'beta');
      });
      sizeControl.hidden = view === 'gallery' && collection !== 'beta';
      allSizeControl.hidden = view === 'list';

      count.textContent =
        view === 'list'
          ? '${navItemCount} nav items'
          : visibleCount + (visibleCount === 1 ? ' icon' : ' icons');
    }

    viewButtons.forEach(button => {
      button.addEventListener('click', () => {
        view = button.dataset.viewControl;
        if (view === 'list' && size === 'all') setSize('16px');
        setPressed(viewButtons, button);
        update();
      });
    });

    collectionButtons.forEach(button => {
      button.addEventListener('click', () => {
        collection = button.dataset.collectionControl;
        setPressed(collectionButtons, button);
        update();
      });
    });

    variantButtons.forEach(button => {
      button.addEventListener('click', () => {
        variant = button.dataset.variantControl;
        setPressed(variantButtons, button);
        update();
      });
    });

    sizeButtons.forEach(button => {
      button.addEventListener('click', () => {
        setSize(button.dataset.sizeControl);
        setPressed(sizeButtons, button);
        update();
      });
    });

    search.addEventListener('input', update);

    function selectionFor(card) {
      const sourceCollection = card.dataset.collection;
      const componentName = card.dataset.componentName;
      const availableSizes = card.dataset.sizes.split(',');
      const preferredSize =
        activeSourceSize ??
        (size === 'all' ? availableSizes[availableSizes.length - 1] : size);
      const sourceSize = availableSizes.includes(preferredSize)
        ? preferredSize
        : availableSizes[availableSizes.length - 1];
      const sourceVariant = activeSourceVariant ?? card.dataset.variant;

      return {
        sourceCollection,
        componentName,
        sourceSize,
        sourceVariant,
      };
    }

    function reactComponentName(componentName, variantName) {
      const variantCard = [...cards].find(
        candidate =>
          candidate.dataset.collection === 'beta' &&
          candidate.dataset.componentName === componentName &&
          candidate.dataset.variant === variantName
      );
      return variantCard?.dataset.reactComponentName ?? componentName;
    }

    function sourceFor(card) {
      const {
        sourceCollection,
        componentName,
        sourceSize,
        sourceVariant,
      } = selectionFor(card);

      if (sourceMode === 'react') {
        const reactName =
          sourceCollection === 'beta'
            ? reactComponentName(componentName, sourceVariant)
            : componentName;
        return {
          contents: sourceData.react[sourceCollection + ':' + reactName] || '',
          filename: reactName + '.tsx',
        };
      }

      return {
        contents:
          sourceData.svg[
            sourceCollection +
              ':' +
              componentName +
              ':' +
              sourceVariant +
              ':' +
              sourceSize
          ] || '',
        filename:
          sourceCollection === 'current'
            ? componentName + '.svg'
            : componentName + '/' + sourceVariant + '-' + sourceSize + '.svg',
      };
    }

    function previewSvgFor(componentName, variantName) {
      const card = [...cards].find(
        candidate =>
          candidate.dataset.collection === 'beta' &&
          candidate.dataset.componentName === componentName &&
          candidate.dataset.variant === variantName &&
          candidate.dataset.sizes.split(',').includes('16px')
      );
      return card
        ?.querySelector('[data-preview-size="16px"] svg')
        ?.cloneNode(true);
    }

    function buildUsageRow(svg, componentName) {
      const row = document.createElement('div');
      row.className = 'source-usage-example';

      const icon = document.createElement('span');
      icon.className = 'source-usage-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.append(svg);

      const codeElement = document.createElement('div');
      codeElement.className = 'source-usage-code';
      codeElement.innerHTML =
        sourceData.usage[componentName] ||
        '<code>&lt;' + componentName + ' size={16} /&gt;</code>';
      row.append(icon, codeElement);
      return row;
    }

    function buildUsageGroup(label, rows) {
      const group = document.createElement('section');
      group.className = 'source-usage-group';

      const heading = document.createElement('h3');
      heading.className = 'source-usage-label';
      heading.textContent = label;
      group.append(heading, ...rows);
      return group;
    }

    function buildPropsGroup() {
      const group = document.createElement('section');
      group.className = 'source-usage-group';

      const heading = document.createElement('h3');
      heading.className = 'source-usage-label';
      heading.textContent = 'Props';

      const table = document.createElement('table');
      table.className = 'source-props-table';
      table.innerHTML = \`
        <thead>
          <tr>
            <th scope="col">Prop</th>
            <th scope="col">Type</th>
            <th scope="col">Default</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>size</code></td>
            <td><code>12 | 16 | 24</code></td>
            <td><code>16</code></td>
          </tr>
          <tr>
            <td><code>color</code></td>
            <td><code>string</code></td>
            <td><code>currentcolor</code></td>
          </tr>
          <tr>
            <td><code>className</code></td>
            <td><code>string</code></td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>aria-label</code></td>
            <td><code>string</code></td>
            <td>—</td>
          </tr>
        </tbody>
      \`;

      group.append(heading, table);
      return group;
    }

    function renderComponentUsage(componentName) {
      const variants = ['outline', 'fill', 'duo'];
      const availableVariants = variants.flatMap(variantName => {
        const svg = previewSvgFor(componentName, variantName);
        return svg == null ? [] : [{ variantName, svg }];
      });
      if (availableVariants.length === 0) {
        sourceUsage.hidden = true;
        sourceUsageGroups.replaceChildren();
        return;
      }

      const rows = availableVariants.map(({ variantName, svg }) => {
        const reactName = reactComponentName(componentName, variantName);
        return buildUsageRow(svg.cloneNode(true), reactName);
      });

      sourceUsageGroups.replaceChildren(
        buildUsageGroup('Variants', rows),
        buildPropsGroup()
      );
      sourceUsage.hidden = false;
    }

    function multiPairFor(componentName) {
      const assignedIndex = multiPairIndexByComponent.get(componentName);
      const pairIndex =
        assignedIndex ??
        mixMultiAssignment(componentName) % multiColorPairs.length;
      return multiColorPairs[pairIndex];
    }

    function hasMultiLayers(svg) {
      return svg?.querySelector('.bg') != null && svg.querySelector('.fg') != null;
    }

    function renderLivePreview() {
      if (!activeCard) return;
      const {
        sourceCollection,
        componentName,
        sourceSize,
        sourceVariant,
      } = selectionFor(activeCard);
      const previews = [...activeCard.querySelectorAll('.icon-preview')];
      const selectedPreview =
        previews.find(preview => preview.dataset.previewSize === sourceSize) ??
        previews[0];
      const svg = selectedPreview?.querySelector('svg');
      const renderedSvg = svg?.cloneNode(true);
      const hasLayers = hasMultiLayers(renderedSvg);
      const colorPair = multiPairFor(componentName);

      sourcePreview.dataset.collection = sourceCollection;
      sourcePreview.dataset.variant = sourceVariant;
      if (!hasLayers) sourceMulti = false;
      sourcePreview.dataset.multi = String(sourceMulti && hasLayers);
      sourcePreview.style.setProperty('--multi-bg', colorPair.background);
      sourcePreview.style.setProperty('--multi-fg', colorPair.foreground);
      sourceLivePreview.replaceChildren(
        ...(renderedSvg == null ? [] : [renderedSvg])
      );
      sourcePreviewControls.hidden = sourceCollection !== 'beta';
      sourceMultiControl.hidden = sourceCollection !== 'beta';
      sourceMultiControl.disabled = !hasLayers;
      sourceMultiControl.setAttribute('aria-checked', String(sourceMulti));
      sourceMultiControl.title = hasLayers
        ? 'Toggle multiple icon colors'
        : 'Multiple color layers are unavailable for this variant';
      sourceVariantButtons.forEach(button => {
        const requestedVariant = button.dataset.sourceVariant;
        const variantCard = [...cards].find(
          candidate =>
            candidate.dataset.collection === sourceCollection &&
            candidate.dataset.componentName === componentName &&
            candidate.dataset.variant === requestedVariant
        );
        button.hidden =
          button.dataset.sourceVariant === 'duo' && variantCard == null;
        button.disabled = variantCard == null;
        button.setAttribute(
          'aria-pressed',
          String(sourceVariant === button.dataset.sourceVariant)
        );
      });
      renderComponentUsage(componentName);
    }

    function createSourceModeControls() {
      const group = document.createElement('div');
      group.className = 'control-group source-mode-control';
      group.setAttribute('aria-label', 'Source format');

      for (const mode of ['react', 'svg']) {
        const button = document.createElement('button');
        button.className = 'control-button source-mode-button';
        button.type = 'button';
        button.dataset.sourceMode = mode;
        button.setAttribute('aria-pressed', String(sourceMode === mode));
        button.textContent = mode === 'react' ? 'React' : 'SVG';
        button.addEventListener('click', () => {
          if (sourceMode === mode) return;
          sourceMode = mode;
          renderSource();
        });
        group.append(button);
      }

      return group;
    }

    async function renderSource() {
      if (!activeCard) return;
      const source = sourceFor(activeCard);
      sourceViewer.textContent = 'Loading @pierre/diffs…';

      try {
        fileInstance?.cleanUp();
        sourceViewer.replaceChildren();
        fileInstance = new PierreDiffsPreview.File({
          theme: { dark: 'pierre-dark', light: 'pierre-light' },
          overflow: 'wrap',
          renderHeaderMetadata: createSourceModeControls,
        });
        fileInstance.render({
          file: {
            name: source.filename,
            contents: source.contents,
            lang: sourceMode === 'svg' ? 'xml' : undefined,
          },
          containerWrapper: sourceViewer,
        });
      } catch (error) {
        const fallback = document.createElement('pre');
        fallback.className = 'source-fallback';
        fallback.textContent = source.contents;
        sourceViewer.replaceChildren(fallback);
        console.error('Could not load @pierre/diffs File preview', error);
      }
    }

    sourceVariantButtons.forEach(button => {
      button.addEventListener('click', () => {
        if (!activeCard || button.disabled) return;
        const currentSelection = selectionFor(activeCard);
        const requestedVariant = button.dataset.sourceVariant;
        const nextCard = [...cards].find(
          candidate =>
            candidate.dataset.collection ===
              currentSelection.sourceCollection &&
            candidate.dataset.componentName ===
              currentSelection.componentName &&
            candidate.dataset.variant === requestedVariant
        );
        if (!nextCard) return;

        const availableSizes = nextCard.dataset.sizes.split(',');
        activeSourceSize = availableSizes.includes(currentSelection.sourceSize)
          ? currentSelection.sourceSize
          : availableSizes[availableSizes.length - 1];
        activeCard.setAttribute('aria-pressed', 'false');
        activeCard = nextCard;
        activeCard.setAttribute('aria-pressed', 'true');
        activeSourceVariant = button.dataset.sourceVariant;
        sourceTitle.textContent = reactComponentName(
          activeCard.dataset.componentName,
          activeCard.dataset.variant
        );
        renderLivePreview();
        renderSource();
      });
    });

    function toggleSourceMulti() {
      if (sourceMultiControl.disabled) return;
      sourceMulti = !sourceMulti;
      renderLivePreview();
    }

    sourceMultiControl.addEventListener('click', toggleSourceMulti);
    sourceMultiControl.addEventListener('keydown', event => {
      if (
        event.key !== ' ' &&
        event.key !== 'Space' &&
        event.key !== 'Enter'
      ) {
        return;
      }
      event.preventDefault();
      toggleSourceMulti();
    });

    sourcePopover.addEventListener('toggle', event => {
      document.body.classList.toggle(
        'source-popover-open',
        event.newState === 'open'
      );
    });

    function openIconPreview(card) {
      if (activeCard) activeCard.setAttribute('aria-pressed', 'false');
      activeCard = card;
      activeCard.setAttribute('aria-pressed', 'true');
      activeSourceSize = null;
      activeSourceVariant = card.dataset.variant;
      sourceMulti = false;
      sourceMode = 'react';
      sourceTitle.textContent =
        card.dataset.collection === 'beta'
          ? reactComponentName(
              card.dataset.componentName,
              card.dataset.variant
            )
          : card.dataset.componentName;
      renderLivePreview();
      if (!sourcePopover.matches(':popover-open')) {
        sourcePopover.showPopover();
      }
      renderSource();
    }

    cards.forEach(card => {
      card.addEventListener('click', () => {
        openIconPreview(card);
      });
    });

    // Keyboard shortcut for search
    document.addEventListener('keydown', (e) => {
      if (
        sourcePopover.matches(':popover-open') &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        const visibleCards = [...cards].filter(card => !card.hidden);
        const preferredVariant = activeCard?.dataset.variant;
        const visibleIcons = new Map();
        visibleCards.forEach(card => {
          const key =
            card.dataset.collection + ':' + card.dataset.componentName;
          if (
            !visibleIcons.has(key) ||
            card.dataset.variant === preferredVariant
          ) {
            visibleIcons.set(key, card);
          }
        });
        const iconCards = [...visibleIcons.values()];
        const activeIndex = iconCards.findIndex(
          card =>
            card.dataset.collection === activeCard?.dataset.collection &&
            card.dataset.componentName === activeCard?.dataset.componentName
        );
        const nextIndex =
          activeIndex + (e.key === 'ArrowRight' ? 1 : -1);
        const nextCard = iconCards[nextIndex];
        if (nextCard) {
          e.preventDefault();
          openIconPreview(nextCard);
        }
        return;
      }
      if (e.key === '/' && document.activeElement !== search) {
        e.preventDefault();
        search.focus();
      }
      if (e.key === 'Escape') {
        search.value = '';
        search.blur();
        update();
      }
    });

    update();
  </script>
</body>
</html>
`;

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Write HTML file
  await writeFile(join(outputDir, 'index.html'), html);

  console.log(`\n✓ Generated preview at dist/index.html`);
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
