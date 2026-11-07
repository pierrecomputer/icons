#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import { optimize } from 'svgo';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  type IconManifest,
  addIconLayerClasses,
  iconLayerStyle,
  prefixSvgIds,
  readSvgRoot,
} from '../../figma/packages/svg-pipeline/src/index.ts';
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
 * Get component name from filename (just removes extension)
 */
function toComponentName(filename: string): string {
  return basename(filename, extname(filename));
}

async function readManifest(svgDir: string): Promise<IconManifest | null> {
  try {
    return JSON.parse(
      await readFile(join(svgDir, 'manifest.json'), 'utf-8')
    ) as IconManifest;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

export async function symbolsFromManifest(
  svgDir: string,
  manifest: IconManifest
): Promise<string[]> {
  const symbols: string[] = [];
  for (const icon of manifest.icons) {
    const baseId = iconNameToKebabCase(icon.name);
    const hasDuoSibling = icon.variants.some(
      (variant) => iconLayerStyle(variant.properties) === 'duo'
    );
    for (const variant of icon.variants) {
      const id =
        variant.key === 'default' ? baseId : `${baseId}-${variant.key}`;
      const svgText = await readFile(
        join(svgDir, icon.name, variant.file),
        'utf-8'
      );
      const layered = addIconLayerClasses(svgText, {
        componentName: icon.name,
        style: iconLayerStyle(variant.properties),
        hasDuoSibling,
      });
      const isolated = prefixSvgIds(layered, id);
      const root = readSvgRoot(isolated);
      const overflow = root.overflow ? ' overflow="visible"' : '';
      symbols.push(
        `  <symbol id="${id}" viewBox="${root.viewBox}"${overflow}>${root.body}</symbol>`
      );
      console.log(
        `${colors.dim}  ✓ ${icon.name}/${variant.file} → #${id}${colors.reset}`
      );
    }
  }
  return symbols;
}

async function writeSprite(
  outputDir: string,
  symbols: string[]
): Promise<void> {
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
${symbols.join('\n')}
</svg>
`;
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'sprite.svg'), sprite);
}

/**
 * Main build function
 */
async function build() {
  console.log(
    `${colors.cyan}${colors.bright}Building SVG sprite...${colors.reset}\n`
  );

  const option = (name: string) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : process.argv[index + 1];
  };
  const svgDir = resolve(projectRoot, option('--svg-dir') ?? 'svg');
  const outputDir = resolve(projectRoot, option('--output-dir') ?? 'dist');

  const manifest = await readManifest(svgDir);
  if (manifest) {
    console.log(
      `${colors.blue}► Building variant symbols from manifest...${colors.reset}`
    );
    const symbols = await symbolsFromManifest(svgDir, manifest);
    await writeSprite(outputDir, symbols);
    console.log(
      `\n${colors.green}${colors.bright}✓ Generated sprite with ${symbols.length} icons${colors.reset}`
    );
    return;
  }

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
      const style = componentName.endsWith('Duo')
        ? 'duo'
        : componentName.endsWith('Fill')
          ? 'fill'
          : 'outline';
      const layeredContent = readSvgRoot(
        addIconLayerClasses(`<svg viewBox="${viewBox}">${content}</svg>`, {
          componentName: componentName.replace(/(?:Duo|Fill)$/, ''),
          style,
          hasDuoSibling: style === 'duo',
        })
      ).body;

      symbols.push(
        `  <symbol id="${symbolId}" viewBox="${viewBox}">${layeredContent}</symbol>`
      );

      console.log(`${colors.dim}  ✓ ${svgFile} → #${symbolId}${colors.reset}`);
    } catch (error) {
      console.error(
        `${colors.red}  ✗ Error processing ${svgFile}: ${error}${colors.reset}`
      );
    }
  }

  await writeSprite(outputDir, symbols);

  console.log(
    `\n${colors.green}${colors.bright}✓ Generated sprite with ${symbols.length} icons${colors.reset}`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  build().catch((error) => {
    console.error(`${colors.red}Build failed: ${error}${colors.reset}`);
    process.exit(1);
  });
}
