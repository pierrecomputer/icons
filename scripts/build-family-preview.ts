#!/usr/bin/env node
import { codeToHtml } from '@pierre/highlights';
import pierreDark from '@pierre/highlights/themes/pierre-dark';
import pierreLight from '@pierre/highlights/themes/pierre-light';
import { build as buildBundle } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { format } from 'prettier';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  type IconLayerContext,
  addIconLayerClasses,
  iconLayerStyle,
} from '../../figma/packages/svg-pipeline/src/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

interface PreviewVariant {
  name: string;
  reactName: string;
  reactSourceHtml: string;
  sizes: string[];
  svg: Record<string, string>;
  svgSourceHtml: Record<string, string>;
}

interface PreviewFamily {
  componentName: string;
  displayName: string;
  variants: PreviewVariant[];
}

function displayName(name: string): string {
  return name
    .replace(/^Icon/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

function reactName(componentName: string, variant: string): string {
  if (variant === 'outline' || variant === 'default') return componentName;
  return `${componentName}${variant.charAt(0).toUpperCase()}${variant.slice(1)}`;
}

async function prepareSvg(
  filePath: string,
  context: IconLayerContext
): Promise<{ rendered: string; sourceHtml: string }> {
  const source = await readFile(filePath, 'utf-8');
  const rendered = addIconLayerClasses(source, context);
  const formatted = await format(rendered, { parser: 'html' });
  return {
    rendered,
    sourceHtml: highlight(formatted, 'xml'),
  };
}

function highlight(source: string, lang: 'tsx' | 'xml'): string {
  return new TextDecoder().decode(
    codeToHtml(source, {
      lang,
      themes: { dark: pierreDark, light: pierreLight },
      defaultColor: 'light-dark()',
    })
  );
}

export async function loadFamilies(): Promise<PreviewFamily[]> {
  const svgRoot = join(projectRoot, 'beta', 'svg');
  const sourceRoot = join(projectRoot, 'src', 'beta');
  const directories = (await readdir(svgRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const families: PreviewFamily[] = [];

  for (const directory of directories) {
    const files = (await readdir(join(svgRoot, directory.name)))
      .filter((file) => file.endsWith('.svg'))
      .sort();
    const hasDuoSibling = files.some((file) => file.startsWith('duo'));
    const variants = new Map<string, PreviewVariant>();

    for (const file of files) {
      const match = /^(.+?)(?:-(\d+(?:\.\d+)?px))?\.svg$/.exec(file);
      if (match === null) continue;
      const [, name, size = '16px'] = match;
      const componentName = directory.name;
      const component = reactName(componentName, name);
      let variant = variants.get(name);
      if (variant === undefined) {
        let reactSourceHtml = '';
        try {
          reactSourceHtml = highlight(
            await readFile(join(sourceRoot, `${component}.tsx`), 'utf-8'),
            'tsx'
          );
        } catch {
          // A missing generated component should not prevent SVG inspection.
        }
        variant = {
          name,
          reactName: component,
          reactSourceHtml,
          sizes: [],
          svg: {},
          svgSourceHtml: {},
        };
        variants.set(name, variant);
      }

      const prepared = await prepareSvg(join(svgRoot, componentName, file), {
        componentName,
        style: iconLayerStyle({ Type: name }),
        hasDuoSibling,
      });
      variant.sizes.push(size);
      variant.svg[size] = prepared.rendered;
      variant.svgSourceHtml[size] = prepared.sourceHtml;
    }

    const preferredOrder = ['outline', 'fill', 'duo'];
    families.push({
      componentName: directory.name,
      displayName: displayName(directory.name),
      variants: [...variants.values()].sort((left, right) => {
        const leftIndex = preferredOrder.indexOf(left.name);
        const rightIndex = preferredOrder.indexOf(right.name);
        return (
          (leftIndex < 0 ? preferredOrder.length : leftIndex) -
            (rightIndex < 0 ? preferredOrder.length : rightIndex) ||
          left.name.localeCompare(right.name)
        );
      }),
    });
  }

  return families;
}

async function build(): Promise<void> {
  console.log('Building icon family preview...\n');
  const families = await loadFamilies();
  const [bundle, layoutStyles, previewStyles] = await Promise.all([
    buildBundle({
      bundle: true,
      entryPoints: [join(__dirname, 'family-preview', 'app.tsx')],
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
    readFile(join(__dirname, 'family-preview', 'styles.css'), 'utf-8'),
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
    <title>@pierre/icons Family Workspace</title>
    <style>${layoutStyles}\n${previewStyles}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__PIERRE_ICON_FAMILIES__=${data};</script>
    <script>${script}</script>
  </body>
</html>`;
  const output = join(projectRoot, 'dist', 'families.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(
    `✓ Generated ${families.length} icon families at dist/families.html`
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
