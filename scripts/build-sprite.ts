#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { optimize } from 'svgo';
import { fileURLToPath } from 'url';

import { SVGOConfig } from '../svgo.config.js';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Process a single SVG file with SVGO and extract content
 */
async function processSvg(
  filePath: string
): Promise<{ viewBox: string; content: string }> {
  const svgContent = await readFile(filePath, 'utf-8');
  const result = optimize(svgContent, SVGOConfig);

  if (result.error) {
    throw new Error(`SVGO error: ${result.error}`);
  }

  const viewBoxMatch = result.data.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 16 16';

  const contentMatch = result.data.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const content = contentMatch ? contentMatch[1] : '';

  return { viewBox, content };
}

/**
 * Convert IconName to kebab-case for symbol id
 */
function iconNameToKebabCase(iconName: string): string {
  return iconName
    .replace(/^Icon/, '')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Convert filename to PascalCase component name
 * Handles files already named with Icon prefix (e.g., IconX.svg → IconX)
 * and files without prefix (e.g., arrow.svg → IconArrow)
 */
function toComponentName(filename: string): string {
  const name = basename(filename, extname(filename));

  // If the filename already starts with "Icon", use it as-is but ensure proper casing
  if (name.startsWith('Icon')) {
    // Already has Icon prefix, just ensure first letter is uppercase
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // Convert kebab-case, snake_case, or space-separated to PascalCase
  const pascalName = name
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return 'Icon' + pascalName;
}

/**
 * Main build function
 */
async function build() {
  console.log(
    `${colors.cyan}${colors.bright}Building SVG sprite...${colors.reset}\n`
  );

  const svgDir = join(projectRoot, 'svg');
  const outputDir = join(projectRoot, 'dist');

  // Check if SVG directory exists
  try {
    await stat(svgDir);
  } catch {
    console.log(
      `${colors.dim}  ℹ No SVG directory found at ${svgDir}${colors.reset}`
    );
    return;
  }

  // Get all SVG files
  const files = await readdir(svgDir);
  const svgFiles = files.filter((file) => file.endsWith('.svg'));

  if (svgFiles.length === 0) {
    console.log(
      `${colors.dim}  ℹ No SVG files found in ${svgDir}${colors.reset}`
    );
    return;
  }

  console.log(
    `${colors.blue}► Processing ${svgFiles.length} SVG files for sprite...${colors.reset}`
  );

  // Process all SVGs and build symbols
  const symbols: string[] = [];

  for (const svgFile of svgFiles) {
    try {
      const { viewBox, content } = await processSvg(join(svgDir, svgFile));
      const componentName = toComponentName(svgFile);
      const symbolId = iconNameToKebabCase(componentName);

      symbols.push(
        `  <symbol id="${symbolId}" viewBox="${viewBox}">${content}</symbol>`
      );

      console.log(`${colors.dim}  ✓ ${svgFile} → #${symbolId}${colors.reset}`);
    } catch (error) {
      console.error(
        `${colors.red}  ✗ Error processing ${svgFile}: ${error}${colors.reset}`
      );
    }
  }

  // Generate sprite SVG
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
${symbols.join('\n')}
</svg>
`;

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Write sprite file
  await writeFile(join(outputDir, 'sprite.svg'), sprite);

  console.log(
    `\n${colors.green}${colors.bright}✓ Generated sprite with ${symbols.length} icons${colors.reset}`
  );
}

build().catch((error) => {
  console.error(`${colors.red}Build failed: ${error}${colors.reset}`);
  process.exit(1);
});
