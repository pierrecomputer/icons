#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { optimize } from 'svgo';
import { fileURLToPath } from 'url';

import { SVGOConfig } from '../svgo.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

type Collection = 'current' | 'new';

interface PreviewIcon {
  collection: Collection;
  componentName: string;
  displayName: string;
  variant: string;
  size: string;
  svg: string;
}

/**
 * Convert filename to display name
 */
function toDisplayName(filename: string): string {
  const name = basename(filename, extname(filename));
  // Remove "Icon" prefix for display
  return name.startsWith('Icon') ? name.slice(4) : name;
}

/**
 * Process SVG and return optimized content
 */
async function processSvg(
  filePath: string,
  preserveExportedPaint = false
): Promise<string> {
  const svgContent = await readFile(filePath, 'utf-8');
  if (preserveExportedPaint) return svgContent;

  const result = optimize(svgContent, SVGOConfig);
  return result.data.replace(/<svg([^>]*)>/, (_match, attributes: string) => {
    const attributesWithoutFill = attributes.replace(/\sfill="[^"]*"/, '');
    return `<svg${attributesWithoutFill} fill="currentColor">`;
  });
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
      icons.push({
        collection: 'current',
        componentName,
        displayName: toDisplayName(svgFile),
        variant: 'default',
        size: '24px',
        svg: await processSvg(join(svgDir, svgFile)),
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
async function loadNewIcons(svgDir: string): Promise<PreviewIcon[]> {
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

    for (const svgFile of files) {
      const variantMatch = /^(.+)-(\d+px)\.svg$/.exec(svgFile);
      if (variantMatch == null) {
        console.warn(
          `Skipping unrecognized new icon variant: ${iconDirectory.name}/${svgFile}`
        );
        continue;
      }

      const [, variant, size] = variantMatch;
      try {
        icons.push({
          collection: 'new',
          componentName: iconDirectory.name,
          displayName: toDisplayName(iconDirectory.name),
          variant,
          size,
          svg: await processSvg(join(directoryPath, svgFile), true),
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
  const newSvgDir = join(projectRoot, 'new-shit', 'svg');
  const outputDir = join(projectRoot, 'dist');

  // Check if SVG directory exists
  try {
    await stat(svgDir);
  } catch {
    console.log('No SVG directory found');
    return;
  }

  const currentIcons = await loadCurrentIcons(svgDir);
  let newIcons: PreviewIcon[] = [];

  try {
    await stat(newSvgDir);
    newIcons = await loadNewIcons(newSvgDir);
  } catch {
    console.log(
      'No new-shit SVG directory found; building the current collection only'
    );
  }

  if (currentIcons.length === 0 && newIcons.length === 0) {
    console.log('No SVG files found');
    return;
  }

  const currentIconCount = new Set(
    currentIcons.map((icon) => icon.componentName)
  ).size;
  const newIconCount = new Set(newIcons.map((icon) => icon.componentName)).size;
  const variants = sortVariants([
    ...new Set(newIcons.map((icon) => icon.variant)),
  ]);
  const sizes = [...new Set(newIcons.map((icon) => icon.size))].sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)
  );

  console.log(
    `Processing ${currentIconCount} current icons and ${newIconCount} new icons (${newIcons.length} variants)...`
  );

  const currentIconCards = currentIcons.map(
    ({ componentName, displayName, svg }) => `
      <button
        class="icon-card"
        data-collection="current"
        data-name="${componentName.toLowerCase()}"
        data-component-name="${componentName}"
        title="Copy ${componentName}"
        type="button"
      >
        <span class="icon-previews">
          <span class="icon-preview" style="--icon-size: 24px">${svg}</span>
        </span>
        <span class="icon-name">${displayName}</span>
      </button>`
  );

  const newIconGroups = new Map<string, PreviewIcon[]>();
  for (const icon of newIcons) {
    const key = `${icon.componentName}-${icon.variant}`;
    const group = newIconGroups.get(key) ?? [];
    group.push(icon);
    newIconGroups.set(key, group);
  }

  const newIconCards = [...newIconGroups.values()].map((icons) => {
    const [{ componentName, displayName, variant }] = icons;
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
        data-collection="new"
        data-name="${componentName.toLowerCase()}"
        data-variant="${variant}"
        data-sizes="${availableSizes.join(',')}"
        data-component-name="${componentName}"
        title="Copy ${componentName}"
        type="button"
      >
        <span class="icon-previews">${previews}</span>
        <span class="icon-name">${displayName}</span>
        <span class="icon-meta">${variant}</span>
      </button>`;
  });

  const iconCards = [...currentIconCards, ...newIconCards];

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
      newIcons.find(
        (icon) =>
          icon.componentName === componentName &&
          icon.variant === 'outline' &&
          icon.size === '16px'
      ) ??
      newIcons.find(
        (icon) =>
          icon.componentName === componentName && icon.variant === 'outline'
      );

    return sizes
      .map((size) => {
        const icon =
          newIcons.find(
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
    { value: 'new', label: `New · ${newIconCount}` },
  ]
    .map(
      ({ value, label }) =>
        `<button class="control-button" type="button" data-collection-control="${value}" aria-pressed="${value === 'current'}">${label}</button>`
    )
    .join('');

  const variantControls = variants
    .map(
      (variant, index) =>
        `<button class="control-button" type="button" data-variant-control="${variant}" aria-pressed="${index === 0}">${variant}</button>`
    )
    .join('');

  const sizeControls = ['all', ...sizes]
    .map(
      (size) =>
        `<button class="control-button${size === 'all' ? ' all-size-control' : ''}" type="button" data-size-control="${size}" aria-pressed="${size === '16px'}">${size === 'all' ? 'All' : size.replace('px', '')}</button>`
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
      --bg: #fff;
      --bg-card: #f9f9f9;
      --bg-card-hover: #f5f5f5;
      --bg-control: #f2f2f2;
      --fg: #333;
      --fg-muted: #777;
      --border: #ddd;
      --accent: #007bff;
      --radius: 12px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0a0a0a;
        --bg-card: #141414;
        --bg-card-hover: #1e1e1e;
        --bg-control: #1e1e1e;
        --fg: #fafafa;
        --fg-muted: #777;
        --border: #262626;
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
      width: 280px;
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
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
      padding: 3px;
      background: var(--bg-control);
      border: 1px solid var(--border);
      border-radius: 10px;
    }

    .control-group[hidden] {
      display: none;
    }

    .control-button {
      min-height: 30px;
      padding: 0.375rem 0.625rem;
      color: var(--fg-muted);
      font: inherit;
      font-size: 0.75rem;
      text-transform: capitalize;
      background: transparent;
      border: 0;
      border-radius: 7px;
      cursor: pointer;
    }

    .control-button:hover {
      color: var(--fg);
    }

    .control-button[aria-pressed="true"] {
      color: var(--fg);
      background: var(--bg);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
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

    .icon-card[data-variant="duo"] .icon-preview {
      color: #8b5cf6;
    }

    .icon-name {
      display: block;
      font-size: 0.625rem;
      color: var(--fg-muted);
      text-align: center;
      word-break: break-word;
      line-height: 1.3;
    }

    .icon-meta {
      display: block;
      color: var(--fg-muted);
      font-size: 0.5625rem;
      line-height: 1;
      text-transform: capitalize;
    }

    .no-results {
      grid-column: 1 / -1;
      text-align: center;
      color: var(--fg-muted);
      padding: 4rem 1rem;
    }

    .toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 0.75rem 1.5rem;
      color: var(--bg);
      font-size: 0.875rem;
      font-weight: 500;
      background-color: var(--fg);
      border-radius: var(--radius);
      opacity: 0;
      transition: all 0.3s;
      pointer-events: none;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
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
    <div class="control-group gallery-control new-control" aria-label="Icon variant" hidden>
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

  <div class="toast" id="toast">Copied!</div>

  <script>
    const search = document.getElementById('search');
    const grid = document.getElementById('grid');
    const navPreview = document.getElementById('nav-preview');
    const navIcons = document.querySelectorAll('[data-nav-icon-size]');
    const cards = document.querySelectorAll('.icon-card');
    const count = document.getElementById('count');
    const noResults = document.getElementById('no-results');
    const toast = document.getElementById('toast');
    const galleryControls = document.querySelectorAll('.gallery-control');
    const sizeControl = document.querySelector('.size-control');
    const allSizeControl = document.querySelector('.all-size-control');
    const viewButtons = document.querySelectorAll('[data-view-control]');
    const collectionButtons = document.querySelectorAll('[data-collection-control]');
    const variantButtons = document.querySelectorAll('[data-variant-control]');
    const sizeButtons = document.querySelectorAll('[data-size-control]');
    let view = 'gallery';
    let collection = 'current';
    let variant = '${variants[0] ?? 'outline'}';
    let size = '${sizes.includes('16px') ? '16px' : (sizes[0] ?? '16px')}';

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
          (card.dataset.variant === variant &&
            (size === 'all' || card.dataset.sizes.split(',').includes(size)));
        const matchesSearch = card.dataset.name.includes(query);
        const visible = matchesCollection && matchesVariant && matchesSearch;

        if (card.dataset.collection === 'new') {
          card.querySelectorAll('[data-preview-size]').forEach(preview => {
            preview.hidden =
              size !== 'all' && preview.dataset.previewSize !== size;
          });

          const visibleSizes =
            size === 'all'
              ? card.dataset.sizes.split(',').join(' / ')
              : size;
          card.querySelector('.icon-meta').textContent =
            card.dataset.variant + ' · ' + visibleSizes;
        }

        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      noResults.hidden = visibleCount !== 0;
      grid.dataset.size = collection === 'new' ? size : 'current';
      grid.hidden = view !== 'gallery';
      navPreview.hidden = view !== 'list';

      navPreview.dataset.size = size;
      navIcons.forEach(icon => {
        icon.hidden = icon.dataset.navIconSize !== size;
      });

      galleryControls.forEach(control => {
        control.hidden =
          view !== 'gallery' ||
          (control.classList.contains('new-control') &&
            collection !== 'new');
      });
      sizeControl.hidden = view === 'gallery' && collection !== 'new';
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

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const iconName = card.dataset.componentName;
        navigator.clipboard.writeText(iconName);

        toast.textContent = \`Copied "\${iconName}"\`;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
      });
    });

    // Keyboard shortcut for search
    document.addEventListener('keydown', (e) => {
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

build().catch((error) => {
  console.error(`Build failed: ${error}`);
  process.exit(1);
});
