// svg-parser is a small HAST parser bundled through SVGR's dependencies.
// It has no TypeScript declarations.
// @ts-expect-error -- untyped dependency
import { parse } from 'svg-parser';

import {
  readSvgRoot,
  referencedSvgIds,
} from '../../figma/packages/svg-pipeline/src/index.ts';

interface HastNode {
  type: 'root' | 'element' | 'text' | 'comment';
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const SPECIAL_ATTRIBUTES: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
  'xlink:href': 'xlinkHref',
  'xlink:title': 'xlinkTitle',
  'xml:lang': 'xmlLang',
  'xml:space': 'xmlSpace',
};

function toReactAttributeName(name: string): string {
  if (SPECIAL_ATTRIBUTES[name]) return SPECIAL_ATTRIBUTES[name];
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function styleObject(value: string): string {
  const entries = value
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator === -1) return [];
      const property = declaration.slice(0, separator).trim();
      const propertyValue = declaration.slice(separator + 1).trim();
      if (!property || !propertyValue) return [];
      const key = property.startsWith('--')
        ? JSON.stringify(property)
        : property.replace(/-([a-z])/g, (_, letter: string) =>
            letter.toUpperCase()
          );
      return [`${key}: ${JSON.stringify(propertyValue)}`];
    });
  return `{{ ${entries.join(', ')} }}`;
}

function scopedAttribute(
  name: string,
  value: string,
  ids: Set<string>
): string | null {
  if (name === 'id' && ids.has(value)) return `{\`\${uid}-${value}\`}`;
  if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
    const id = value.slice(1);
    if (ids.has(id)) return `{\`#\${uid}-${id}\`}`;
  }

  let changed = false;
  const scoped = value.replace(
    /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g,
    (match, quote: string, id: string) => {
      if (!ids.has(id)) return match;
      changed = true;
      return `url(${quote}#\${uid}-${id}${quote})`;
    }
  );
  return changed ? `{\`${scoped}\`}` : null;
}

function attributes(
  properties: Record<string, unknown>,
  ids: Set<string>
): string {
  const values = Object.entries(properties).map(([rawName, rawValue]) => {
    const name = toReactAttributeName(rawName);
    const value = String(rawValue);
    if (name === 'style') return `style=${styleObject(value)}`;
    return `${name}=${scopedAttribute(rawName, value, ids) ?? JSON.stringify(value)}`;
  });
  return values.length > 0 ? ` ${values.join(' ')}` : '';
}

function toJsx(node: HastNode, ids: Set<string>): string {
  if (node.type === 'text') {
    const value = (node.value ?? '').trim();
    return value
      ? value.replace(
          /[{}<>]/g,
          (character) => `{${JSON.stringify(character)}}`
        )
      : '';
  }
  if (node.type !== 'element' || !node.tagName) return '';

  const children = (node.children ?? [])
    .map((child) => toJsx(child, ids))
    .filter(Boolean);
  const open = `<${node.tagName}${attributes(node.properties ?? {}, ids)}`;
  return children.length === 0
    ? `${open} />`
    : `${open}>${children.join('')}</${node.tagName}>`;
}

export interface ParsedSvgVariant {
  viewBox: string;
  overflow: boolean;
  body: string;
  scopedIds: boolean;
}

export function svgToJsx(svgText: string): ParsedSvgVariant {
  const root = readSvgRoot(svgText);
  const parsed = parse(svgText) as HastNode;
  const svg = parsed.children?.find(
    (child) => child.type === 'element' && child.tagName === 'svg'
  );
  if (!svg) throw new Error('Could not parse SVG.');

  const ids = referencedSvgIds(svgText);
  const children = (svg.children ?? [])
    .map((child) => toJsx(child, ids))
    .filter(Boolean);
  return {
    viewBox: root.viewBox,
    overflow: root.overflow,
    body: children.length === 1 ? children[0] : `<>${children.join('')}</>`,
    scopedIds: ids.size > 0,
  };
}
