import type { Config } from 'svgo';
import { optimize } from 'svgo/browser';

export function sanitizeClassName(layerName: string): string {
  return layerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, '')
    .replace(/\s+/g, '-');
}

/** The first element carrying each id, matching what `#id` would select. */
function elementsById(svgRoot: Element): Map<string, Element> {
  const byId = new Map<string, Element>();
  for (const element of Array.from(svgRoot.querySelectorAll('[id]'))) {
    const id = element.getAttribute('id');
    if (id && !byId.has(id)) byId.set(id, element);
  }
  return byId;
}

function findElementByLayerName(
  byId: Map<string, Element>,
  layerName: string
): Element | null {
  const candidates = [
    layerName,
    layerName.replace(/\s+/g, '-'),
    layerName.replace(/\s+/g, '_'),
  ];

  for (const candidate of candidates) {
    const found = byId.get(candidate);
    // Groups are unwrapped later, so a class on one would be lost.
    if (found && found.tagName.toLowerCase() !== 'g') return found;
  }
  return null;
}

function addLayerClasses(svgRoot: Element, layerNames: string[]): void {
  if (layerNames.length === 0) return;
  const byId = elementsById(svgRoot);

  for (const layerName of layerNames) {
    const className = sanitizeClassName(layerName);
    if (!className) continue;

    const target = findElementByLayerName(byId, layerName);
    if (!target) continue;

    const existing = target.getAttribute('class');
    if (existing) {
      const classes = new Set(existing.split(/\s+/).filter(Boolean));
      classes.add(className);
      target.setAttribute('class', Array.from(classes).join(' '));
    } else {
      target.setAttribute('class', className);
    }
  }
}

function referencedIds(svgRoot: Element): Set<string> {
  const referenced = new Set<string>();
  for (const element of Array.from(svgRoot.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value;
      for (const match of value.matchAll(
        /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g
      )) {
        referenced.add(match[2]);
      }
      if (
        (attribute.name === 'href' || attribute.name === 'xlink:href') &&
        value.startsWith('#')
      ) {
        referenced.add(value.slice(1));
      }
    }
  }
  return referenced;
}

function removeSourceIds(svgRoot: Element): void {
  const referenced = referencedIds(svgRoot);
  for (const element of Array.from(svgRoot.querySelectorAll('[id]'))) {
    const id = element.getAttribute('id');
    if (id && !referenced.has(id)) element.removeAttribute('id');
  }
}

/**
 * Whether a group only names its layer. Anything else on it — `mask`,
 * `clip-path`, `filter`, `opacity`, `transform` — applies to its children as a
 * whole, so unwrapping would change the drawing.
 */
export function isWrapperGroup(attributeNames: string[]): boolean {
  return attributeNames.every((name) => name === 'id' || name === 'class');
}

function unwrapGroups(svgRoot: Element): void {
  for (const group of Array.from(svgRoot.querySelectorAll('g'))) {
    const names = Array.from(group.attributes, (attribute) => attribute.name);
    if (!isWrapperGroup(names)) continue;
    const parent = group.parentNode;
    if (!parent) continue;
    while (group.firstChild) parent.insertBefore(group.firstChild, group);
    parent.removeChild(group);
  }
}

function transform(svgText: string, edit: (svgRoot: Element) => void): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  edit(doc.documentElement);
  return new XMLSerializer().serializeToString(doc);
}

export function applyLayerNameClasses(
  svgText: string,
  layerNames: string[]
): string {
  if (layerNames.length === 0) return svgText;
  return transform(svgText, (svgRoot) => addLayerClasses(svgRoot, layerNames));
}

export function removeGroupWrappers(svgText: string): string {
  return transform(svgText, unwrapGroups);
}

/** Removes Figma layer ids that are not required by an SVG reference. */
export function removeUnreferencedIds(svgText: string): string {
  return transform(svgText, removeSourceIds);
}

export function cleanFigmaSvg(svgText: string, layerNames: string[]): string {
  return transform(svgText, (svgRoot) => {
    addLayerClasses(svgRoot, layerNames);
    unwrapGroups(svgRoot);
    removeSourceIds(svgRoot);
  });
}

export function optimizeSvg(svgText: string, config: Config | null): string {
  if (!config) return svgText;
  return optimize(svgText, config).data || svgText;
}
