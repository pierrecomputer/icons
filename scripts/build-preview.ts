#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { optimize } from 'svgo';
import { fileURLToPath } from 'url';

import { SVGOConfig } from '../svgo.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

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
async function processSvg(filePath: string): Promise<string> {
  const svgContent = await readFile(filePath, 'utf-8');
  const result = optimize(svgContent, SVGOConfig);
  return result.data;
}

/**
 * Main build function
 */
async function build() {
  console.log('Building icon preview...\n');

  const svgDir = join(projectRoot, 'svg');
  const outputDir = join(projectRoot, 'dist');

  // Check if SVG directory exists
  try {
    await stat(svgDir);
  } catch {
    console.log('No SVG directory found');
    return;
  }

  // Get all SVG files
  const files = await readdir(svgDir);
  const svgFiles = files.filter((file) => file.endsWith('.svg')).sort();

  if (svgFiles.length === 0) {
    console.log('No SVG files found');
    return;
  }

  console.log(`Processing ${svgFiles.length} icons...`);

  // Build icon cards
  const iconCards: string[] = [];

  for (const svgFile of svgFiles) {
    try {
      const svgContent = await processSvg(join(svgDir, svgFile));
      const displayName = toDisplayName(svgFile);

      // Add fill="currentColor" to make icons inherit color
      const coloredSvg = svgContent.replace(/<svg/, '<svg fill="currentColor"');

      iconCards.push(`
      <div class="icon-card" title="${displayName}">
        ${coloredSvg}
        <div class="icon-name">${displayName}</div>
      </div>`);
    } catch (error) {
      console.error(`Error processing ${svgFile}: ${error}`);
    }
  }

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
      margin: 0 auto 2rem;
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

    .search-container {
      position: relative;
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

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 1rem;
      max-width: 1400px;
      margin-inline: auto;
    }

    .icon-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 1.5rem 0.5rem;
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

    .icon-card.hidden {
      display: none;
    }

    .icon-card svg {
      width: 24px;
      height: 24px;
      color: var(--fg);
    }

    .icon-name {
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
      <p class="count">${svgFiles.length} icons</p>
    </div>
    <div class="search-container">
      <input type="text" class="search" placeholder="Search icons..." id="search">
    </div>
  </div>

  <div class="grid" id="grid">
    ${iconCards.join('')}
  </div>

  <div class="toast" id="toast">Copied!</div>

  <script>
    const search = document.getElementById('search');
    const grid = document.getElementById('grid');
    const cards = document.querySelectorAll('.icon-card');
    const toast = document.getElementById('toast');

    // Search functionality
    search.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      let visibleCount = 0;

      cards.forEach(card => {
        const name = card.querySelector('.icon-name').textContent.toLowerCase();
        const matches = name.includes(query);
        card.classList.toggle('hidden', !matches);
        if (matches) visibleCount++;
      });

      // Show/hide no results message
      let noResults = document.querySelector('.no-results');
      if (visibleCount === 0 && !noResults) {
        noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.textContent = 'No icons found';
        grid.appendChild(noResults);
      } else if (visibleCount > 0 && noResults) {
        noResults.remove();
      }
    });

    // Copy icon name on click
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const name = card.querySelector('.icon-name').textContent;
        const iconName = 'Icon' + name;
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
        search.blur();
        search.value = '';
        search.dispatchEvent(new Event('input'));
      }
    });
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
