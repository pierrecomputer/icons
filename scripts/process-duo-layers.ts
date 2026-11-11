#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  type IconLayerContext,
  type IconManifest,
  addIconLayerClasses,
  iconLayerStyle,
} from '../../figma/packages/svg-pipeline/src/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function readManifest(svgDir: string): Promise<IconManifest | null> {
  try {
    return JSON.parse(
      await readFile(join(svgDir, 'manifest.json'), 'utf-8')
    ) as IconManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

interface LayerFile {
  file: string;
  context: IconLayerContext;
}

async function layerFiles(svgDir: string): Promise<LayerFile[]> {
  const manifest = await readManifest(svgDir);
  if (manifest) {
    return manifest.icons.flatMap((icon) => {
      const hasDuoSibling = icon.variants.some(
        (variant) => iconLayerStyle(variant.properties) === 'duo'
      );
      return icon.variants.map((variant) => ({
        file: join(svgDir, icon.name, variant.file),
        context: {
          componentName: icon.name,
          style: iconLayerStyle(variant.properties),
          hasDuoSibling,
        },
      }));
    });
  }

  return (await readdir(svgDir))
    .filter(
      (file) =>
        extname(file).toLowerCase() === '.svg' &&
        basename(file, extname(file)).endsWith('Duo')
    )
    .map((file) => ({
      file: join(svgDir, file),
      context: {
        componentName: basename(file, extname(file)).replace(/Duo$/, ''),
        style: 'duo',
        hasDuoSibling: true,
      },
    }));
}

export async function processIconLayers(svgDir: string): Promise<number> {
  let changed = 0;
  for (const { file, context } of await layerFiles(svgDir)) {
    const source = await readFile(file, 'utf-8');
    const layered = addIconLayerClasses(source, context);
    if (layered === source) continue;
    await writeFile(file, layered);
    changed += 1;
  }
  return changed;
}

async function main(): Promise<void> {
  const optionIndex = process.argv.indexOf('--svg-dir');
  const svgDir = resolve(
    projectRoot,
    optionIndex === -1 ? 'svg' : process.argv[optionIndex + 1]
  );
  const changed = await processIconLayers(svgDir);
  console.log(`Classified icon layers in ${changed} SVG file(s).`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`Duo layer processing failed: ${error}`);
    process.exit(1);
  });
}
