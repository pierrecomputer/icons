export interface FrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EPSILON = 0.001;
const ID_REFERENCE =
  /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)|\bhref=(["'])#([^"']+)\3/g;
const PAINTABLE_ELEMENT =
  /<(path|circle|rect|ellipse|polygon|polyline|line)\b([^>]*?)(\/?)>/gi;
const NON_RENDERED = /<(mask|clipPath)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/gi;
const MASK_ELEMENT = /<mask\b[^>]*?(?:\/>|>[\s\S]*?<\/mask\s*>)/gi;
const KEPT_FILL = 'data-mask-fill';
const DUO_PAINTABLE = new Set([
  'path',
  'circle',
  'rect',
  'ellipse',
  'polygon',
  'polyline',
  'line',
  'text',
  'use',
]);
const DUO_NON_RENDERED = new Set([
  'defs',
  'mask',
  'clippath',
  'lineargradient',
  'radialgradient',
  'pattern',
  'marker',
]);

function readAttribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\s${name}=(["'])([^"']*)\\1`, 'i').exec(
    attributes
  );
  return match ? match[2] : null;
}

function withoutAttribute(attributes: string, name: string): string {
  return attributes.replace(new RegExp(`\\s${name}=(["'])[^"']*\\1`, 'gi'), '');
}

function replaceAttribute(
  attributes: string,
  name: string,
  value: string
): string {
  const pattern = new RegExp(`\\s${name}=(["'])[^"']*\\1`, 'i');
  if (pattern.test(attributes)) {
    return attributes.replace(pattern, ` ${name}="${value}"`);
  }
  return `${attributes} ${name}="${value}"`;
}

function opacityValue(attributes: string, name: string): number {
  const attribute = readAttribute(attributes, name);
  const style = readAttribute(attributes, 'style');
  const raw =
    attribute ??
    (style
      ? new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style)?.[1]
      : null);
  if (raw == null) return 1;
  const value = raw.trim().endsWith('%')
    ? Number.parseFloat(raw) / 100
    : Number(raw);
  return Number.isFinite(value) ? value : 1;
}

function withLayerClass(attributes: string, layer: 'bg' | 'fg'): string {
  const match = /\sclass=(["'])([^"']*)\1/i.exec(attributes);
  if (!match) return `${attributes} class="${layer}"`;

  const classes = match[2].split(/\s+/).filter(Boolean);
  if (classes.includes('bg') || classes.includes('fg')) return attributes;
  classes.push(layer);
  return attributes.replace(
    match[0],
    ` class=${match[1]}${classes.join(' ')}${match[1]}`
  );
}

interface DuoAncestor {
  tag: string;
  opacity: number;
  classified: boolean;
  nonRendered: boolean;
}

/**
 * Adds stable hooks to duotone artwork without changing paint or opacity.
 *
 * Translucent groups are treated as one background layer. Otherwise rendered
 * shapes are classified from their effective opacity, including inherited
 * group opacity and fill/stroke opacity. Definition geometry is never marked.
 */
export function addDuoLayerClasses(svgText: string): string {
  const ancestors: DuoAncestor[] = [];
  const tagPattern = /<\/?\s*[A-Za-z][^>]*>/g;
  let result = '';
  let cursor = 0;

  for (const match of svgText.matchAll(tagPattern)) {
    const token = match[0];
    const index = match.index;
    result += svgText.slice(cursor, index);
    cursor = index + token.length;

    if (/^<\s*\//.test(token)) {
      const tag = /^<\s*\/\s*([^\s>]+)/.exec(token)?.[1]?.toLowerCase();
      if (tag && ancestors[ancestors.length - 1]?.tag === tag) ancestors.pop();
      result += token;
      continue;
    }

    const opening = /^<\s*([^\s/>]+)([\s\S]*?)(\/?)>$/.exec(token);
    if (!opening) {
      result += token;
      continue;
    }

    const [, rawTag, rawAttributes, close] = opening;
    const tag = rawTag.toLowerCase();
    const parent = ancestors[ancestors.length - 1];
    const nonRendered =
      (parent?.nonRendered ?? false) || DUO_NON_RENDERED.has(tag);
    const ownOpacity = opacityValue(rawAttributes, 'opacity');
    const effectiveOpacity = (parent?.opacity ?? 1) * ownOpacity;
    const classifiedByAncestor = parent?.classified ?? false;
    const classifyGroup =
      tag === 'g' && !nonRendered && !classifiedByAncestor && ownOpacity < 1;
    let attributes = rawAttributes;

    if (classifyGroup) {
      attributes = withLayerClass(attributes, 'bg');
    } else if (
      DUO_PAINTABLE.has(tag) &&
      !nonRendered &&
      !classifiedByAncestor
    ) {
      const paintOpacity = Math.min(
        opacityValue(attributes, 'fill-opacity'),
        opacityValue(attributes, 'stroke-opacity')
      );
      attributes = withLayerClass(
        attributes,
        effectiveOpacity * paintOpacity < 1 ? 'bg' : 'fg'
      );
    }

    result += `<${rawTag}${attributes}${close}>`;
    if (close !== '/') {
      ancestors.push({
        tag,
        opacity: effectiveOpacity,
        classified: classifiedByAncestor || classifyGroup,
        nonRendered,
      });
    }
  }

  return result + svgText.slice(cursor);
}

export type IconLayerStyle = 'outline' | 'fill' | 'duo';

export interface IconLayerContext {
  componentName: string;
  style: IconLayerStyle | null;
  hasDuoSibling: boolean;
}

/** Reads the visual style from a Figma variant property map. */
export function iconLayerStyle(
  properties: Record<string, string>
): IconLayerStyle | null {
  for (const value of Object.values(properties)) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'outline' || normalized === 'fill') return normalized;
    if (normalized === 'duo' || normalized === 'duotone') return 'duo';
  }
  return null;
}

const BADGED_CONTAINER =
  /^Icon(?:File|Folder)Badge(?:ArrowUp|Clock|Ellipsis|Gear|Minus|Plus)$/;

const SUBTRACT_FIRST_ICONS = new Set([
  'IconBellUnread',
  'IconInboxFull',
  'IconInboxUnread',
]);

/**
 * These families have a verified container-first export structure: the first
 * paintable is the base/container and every remaining paintable is its mark.
 * Exact component identity plus a Duo sibling keeps the rule conservative.
 */
const CONTAINER_GLYPH_ICONS = new Set([
  'IconCircleBang',
  'IconCircleCheck',
  'IconCircleMinus',
  'IconCirclePlus',
  'IconCircleSlash',
  'IconCircleX',
  'IconCommentCheck',
  'IconCommentCode',
  'IconCommentPlus',
  'IconFileArrow',
  'IconFileCode',
  'IconFileImage',
  'IconFileLock',
  'IconFileRichText',
  'IconFileSpreadsheet',
  'IconFileText',
  'IconFileZip',
  'IconFolderArrow',
  'IconFolderCode',
  'IconShieldLock',
  'IconSquircleArrow135Dot',
  'IconSquircleArrow315Dot',
  'IconSquircleArrow45Dot',
  'IconSquircleArrowDown',
  'IconSquircleArrowUp',
  'IconSquircleBang',
  'IconSquircleBash',
  'IconSquircleCheck',
  'IconSquircleChevronsRight',
  'IconSquircleCode',
  'IconSquircleDiffstat',
  'IconSquircleDot',
  'IconSquircleEllipsis',
  'IconSquircleInfo',
  'IconSquircleMinus',
  'IconSquirclePlus',
  'IconSquircleQuestion',
  'IconSquircleSlash',
  'IconSquircleTerminal',
  'IconSquircleX',
  'IconTag',
  'IconTriangleBang',
]);

const FILL_FIRST_BACKGROUND_ICONS = new Set([
  'IconCommit',
  'IconSidebarLeft',
  'IconSidebarRight',
]);

const OUTLINE_FIRST_BACKGROUND_ICONS = new Set(['IconBox']);

const REVERSED_TWO_LAYER_ICONS = new Set([
  'IconColorModeAuto',
  'IconCopy',
  'IconDiffSplit',
  'IconDiffStacked',
]);

interface PaintableToken {
  start: number;
  end: number;
  rawTag: string;
  attributes: string;
  close: string;
}

function classNames(attributes: string): string[] {
  return (
    /\sclass=(["'])([^"']*)\1/i
      .exec(attributes)?.[2]
      .split(/\s+/)
      .filter(Boolean) ?? []
  );
}

function hasExplicitLayers(svgText: string): boolean {
  for (const match of svgText.matchAll(/\sclass=(["'])([^"']*)\1/gi)) {
    const names = match[2].split(/\s+/);
    if (names.includes('bg') || names.includes('fg')) return true;
  }
  return false;
}

function isRenderedPaintable(attributes: string): boolean {
  if (readAttribute(attributes, 'display') === 'none') return false;
  const fill = readAttribute(attributes, 'fill');
  const stroke = readAttribute(attributes, 'stroke');
  return fill !== 'none' || (stroke != null && stroke !== 'none');
}

function renderedPaintables(svgText: string): PaintableToken[] {
  const ancestors: Array<{ tag: string; nonRendered: boolean }> = [];
  const paintables: PaintableToken[] = [];
  const tagPattern = /<\/?\s*[A-Za-z][^>]*>/g;

  for (const match of svgText.matchAll(tagPattern)) {
    const token = match[0];
    if (/^<\s*\//.test(token)) {
      const tag = /^<\s*\/\s*([^\s>]+)/.exec(token)?.[1]?.toLowerCase();
      if (tag && ancestors[ancestors.length - 1]?.tag === tag) ancestors.pop();
      continue;
    }

    const opening = /^<\s*([^\s/>]+)([\s\S]*?)(\/?)>$/.exec(token);
    if (!opening) continue;
    const [, rawTag, attributes, close] = opening;
    const tag = rawTag.toLowerCase();
    const nonRendered =
      (ancestors[ancestors.length - 1]?.nonRendered ?? false) ||
      DUO_NON_RENDERED.has(tag);

    if (
      DUO_PAINTABLE.has(tag) &&
      !nonRendered &&
      isRenderedPaintable(attributes)
    ) {
      paintables.push({
        start: match.index,
        end: match.index + token.length,
        rawTag,
        attributes,
        close,
      });
    }

    if (close !== '/') ancestors.push({ tag, nonRendered });
  }
  return paintables;
}

type LayerRole = 'bg' | 'fg';

function firstBackground(paintables: PaintableToken[]): LayerRole[] {
  return paintables.map((_paintable, index) => (index === 0 ? 'bg' : 'fg'));
}

function paintOpacity(paintable: PaintableToken): number {
  return Math.min(
    opacityValue(paintable.attributes, 'opacity'),
    opacityValue(paintable.attributes, 'fill-opacity'),
    opacityValue(paintable.attributes, 'stroke-opacity')
  );
}

function semanticLayerRoles(
  context: IconLayerContext,
  paintables: PaintableToken[]
): LayerRole[] | null {
  if (context.style !== 'fill' && context.style !== 'outline') return null;
  const first = paintables[0];
  if (BADGED_CONTAINER.test(context.componentName)) {
    return classNames(first.attributes).includes('subtract')
      ? firstBackground(paintables)
      : null;
  }
  if (SUBTRACT_FIRST_ICONS.has(context.componentName)) {
    return paintables.length === 2 &&
      classNames(first.attributes).includes('subtract')
      ? firstBackground(paintables)
      : null;
  }
  if (
    context.componentName === 'IconLineGraphArea' &&
    context.style === 'outline'
  ) {
    return paintables.length === 2 &&
      classNames(first.attributes).includes('intersect') &&
      paintOpacity(first) === 0.4
      ? ['bg', 'fg']
      : null;
  }
  if (context.componentName === 'IconDiffBars' && context.style === 'outline') {
    return paintables.length === 4 && paintOpacity(first) === 0.4
      ? ['bg', 'fg', 'fg', 'fg']
      : null;
  }
  if (context.componentName === 'IconBuilding') {
    const roles = paintables.map((paintable) =>
      paintOpacity(paintable) < 1 ? 'bg' : 'fg'
    );
    return roles.includes('bg') && roles.includes('fg') ? roles : null;
  }
  if (
    context.style === 'fill' &&
    FILL_FIRST_BACKGROUND_ICONS.has(context.componentName)
  ) {
    if (paintables.length !== 2) return null;
    if (context.componentName === 'IconCommit') {
      return classNames(first.attributes).includes('union') &&
        paintables[1].rawTag.toLowerCase() === 'circle'
        ? ['bg', 'fg']
        : null;
    }
    return classNames(first.attributes).includes('rectangle-741')
      ? ['bg', 'fg']
      : null;
  }
  if (
    context.style === 'outline' &&
    OUTLINE_FIRST_BACKGROUND_ICONS.has(context.componentName)
  ) {
    return paintables.length === 2 &&
      paintables.every((paintable) => paintable.rawTag.toLowerCase() === 'path')
      ? ['bg', 'fg']
      : null;
  }
  if (REVERSED_TWO_LAYER_ICONS.has(context.componentName)) {
    const allowedStyle =
      context.componentName === 'IconCopy'
        ? context.style === 'fill' || context.style === 'outline'
        : context.style === 'outline';
    if (!allowedStyle || paintables.length !== 2) return null;
    if (
      context.componentName === 'IconDiffSplit' ||
      context.componentName === 'IconDiffStacked'
    ) {
      return classNames(first.attributes).includes('subtract') &&
        paintOpacity(paintables[1]) < 1
        ? ['fg', 'bg']
        : null;
    }
    if (context.componentName === 'IconCopy') {
      return paintOpacity(paintables[1]) === 0.4 ? ['fg', 'bg'] : null;
    }
    return readAttribute(paintables[1].attributes, 'fill-rule') === 'evenodd'
      ? ['fg', 'bg']
      : null;
  }
  return context.hasDuoSibling &&
    CONTAINER_GLYPH_ICONS.has(context.componentName)
    ? firstBackground(paintables)
    : null;
}

/**
 * Adds stable `.bg`/`.fg` hooks using opacity for Duo and conservative,
 * component-aware structure rules for Fill/Outline. Existing explicit layer
 * classes always win, and unknown or single-paintable artwork is untouched.
 */
export function addIconLayerClasses(
  svgText: string,
  context: IconLayerContext
): string {
  if (context.style === 'duo') return addDuoLayerClasses(svgText);
  if (hasExplicitLayers(svgText)) return svgText;

  const paintables = renderedPaintables(svgText);
  if (paintables.length < 2) return svgText;
  const roles = semanticLayerRoles(context, paintables);
  if (!roles) return svgText;

  let result = svgText;
  for (let index = paintables.length - 1; index >= 0; index -= 1) {
    const paintable = paintables[index];
    const attributes = withLayerClass(paintable.attributes, roles[index]);
    result =
      result.slice(0, paintable.start) +
      `<${paintable.rawTag}${attributes}${paintable.close}>` +
      result.slice(paintable.end);
  }
  return result;
}

function exportedBox(attributes: string): FrameBox | null {
  const viewBox = readAttribute(attributes, 'viewBox');
  if (viewBox) {
    const [x, y, width, height] = viewBox.split(/[\s,]+/).map(Number);
    if ([x, y, width, height].every(Number.isFinite)) {
      return { x, y, width, height };
    }
  }
  const width = Number(readAttribute(attributes, 'width'));
  const height = Number(readAttribute(attributes, 'height'));
  if (width && height) return { x: 0, y: 0, width, height };
  return null;
}

function sameBox(a: FrameBox, b: FrameBox): boolean {
  return (
    Math.abs(a.x - b.x) < EPSILON &&
    Math.abs(a.y - b.y) < EPSILON &&
    Math.abs(a.width - b.width) < EPSILON &&
    Math.abs(a.height - b.height) < EPSILON
  );
}

function formatBox(box: FrameBox): string {
  return [box.x, box.y, box.width, box.height]
    .map((value) => Number(value.toFixed(3)))
    .join(' ');
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** Restore a Figma export's logical frame and retain artwork drawn past it. */
export function fitSvgToFrame(svgText: string, frame: FrameBox): string {
  if (!(frame.width > 0 && frame.height > 0)) return svgText;

  const canonical = { x: 0, y: 0, width: frame.width, height: frame.height };
  let shifted = false;
  let result = svgText.replace(
    /<svg\b([^>]*?)(\/?)>/i,
    (match, raw: string, close: string) => {
      const exported = exportedBox(raw);
      if (
        exported &&
        sameBox(exported, canonical) &&
        sameBox(frame, canonical)
      ) {
        return match;
      }

      let attributes = raw;
      for (const name of ['viewBox', 'width', 'height', 'overflow']) {
        attributes = withoutAttribute(attributes, name);
      }
      attributes += ` viewBox="${formatBox(canonical)}"`;
      if (exported) attributes += ` overflow="visible"`;

      shifted =
        close !== '/' &&
        (Math.abs(frame.x) >= EPSILON || Math.abs(frame.y) >= EPSILON);
      const transform = shifted
        ? `<g transform="translate(${formatNumber(-frame.x)} ${formatNumber(-frame.y)})">`
        : '';
      return `<svg${attributes}${close}>${transform}`;
    }
  );

  if (shifted) result = result.replace(/<\/svg\s*>\s*$/i, '</g></svg>');
  return result;
}

export function referencedSvgIds(svgText: string): Set<string> {
  const ids = new Set<string>();
  const pattern = new RegExp(ID_REFERENCE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(svgText))) ids.add(match[2] ?? match[4]);
  return ids;
}

function renameIds(
  text: string,
  ids: Set<string>,
  rename: (id: string) => string
): string {
  if (ids.size === 0) return text;
  return text
    .replace(
      /(\sid=)(["'])([^"']+)\2/g,
      (match, prefix: string, quote: string, id: string) =>
        ids.has(id) ? `${prefix}${quote}${rename(id)}${quote}` : match
    )
    .replace(
      new RegExp(ID_REFERENCE.source, 'g'),
      (match, urlQuote, urlId, hrefQuote, hrefId) => {
        const id = urlId ?? hrefId;
        if (!ids.has(id)) return match;
        return urlId != null
          ? `url(${urlQuote}#${rename(id)}${urlQuote})`
          : `href=${hrefQuote}#${rename(id)}${hrefQuote}`;
      }
    );
}

export function prefixSvgIds(svgText: string, prefix: string): string {
  const safe = prefix.replace(/[^a-zA-Z0-9_-]+/g, '-');
  return renameIds(svgText, referencedSvgIds(svgText), (id) => `${safe}-${id}`);
}

function renameInMasks(svgText: string, from: string, to: string): string {
  const attribute = new RegExp(`(\\s)${from}=`, 'gi');
  return svgText.replace(new RegExp(MASK_ELEMENT.source, 'gi'), (mask) =>
    mask.replace(
      /^(<mask\b[^>]*>)([\s\S]*)$/i,
      (_match, open: string, inner: string) =>
        open + inner.replace(attribute, `$1${to}=`)
    )
  );
}

export function protectMaskPaint(svgText: string): string {
  return renameInMasks(svgText, 'fill', KEPT_FILL);
}

export function restoreMaskPaint(svgText: string): string {
  return renameInMasks(svgText, KEPT_FILL, 'fill');
}

function outsideNonRendered(
  text: string,
  edit: (segment: string) => string
): string {
  const pattern = new RegExp(NON_RENDERED.source, 'gi');
  let result = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    result += edit(text.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return result + edit(text.slice(last));
}

/** Normalize rendered shapes without changing mask or clip-path geometry. */
export function normalizeSvgPaints(svgText: string, duo = false): string {
  let firstShape = true;
  const painted = outsideNonRendered(svgText, (segment) =>
    segment.replace(PAINTABLE_ELEMENT, (...parts) => {
      const tag = String(parts[1]);
      let attributes = String(parts[2]);
      const close = String(parts[3]);
      const hasFill = /\sfill=(["'])/i.test(attributes);
      const hasStroke = /\sstroke=(["'])/i.test(attributes);

      if (hasFill && !/\sfill=(["'])none\1/i.test(attributes)) {
        attributes = replaceAttribute(attributes, 'fill', 'currentColor');
      }
      if (hasStroke && !/\sstroke=(["'])none\1/i.test(attributes)) {
        attributes = replaceAttribute(attributes, 'stroke', 'currentColor');
      }
      if (!hasFill && !hasStroke) {
        attributes = replaceAttribute(attributes, 'fill', 'currentColor');
      }

      if (duo) {
        attributes = withoutAttribute(attributes, 'fill-opacity');
        attributes = withoutAttribute(attributes, 'stroke-opacity');
        attributes = replaceAttribute(
          attributes,
          'opacity',
          firstShape ? '0.25' : '1'
        );
      }
      firstShape = false;
      return `<${tag}${attributes}${close}>`;
    })
  );

  return painted.replace(
    /<svg\b([^>]*?)>/i,
    (_match, attributes: string) =>
      `<svg${replaceAttribute(attributes, 'fill', 'none')}>`
  );
}

export interface SvgRoot {
  viewBox: string;
  overflow: boolean;
  body: string;
}

export function readSvgRoot(svgText: string): SvgRoot {
  const match = /<svg\b([^>]*)>([\s\S]*)<\/svg\s*>/i.exec(svgText.trim());
  if (!match) throw new Error('Could not parse SVG root.');
  return {
    viewBox: readAttribute(match[1], 'viewBox') ?? '',
    overflow: readAttribute(match[1], 'overflow') === 'visible',
    body: match[2],
  };
}
