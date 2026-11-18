export interface ManifestAxisValue {
  figma: string;
  prop: string;
}

export interface ManifestAxis {
  axis: string;
  prop: string;
  numeric: boolean;
  values: ManifestAxisValue[];
  defaultValue: string;
}

export interface ManifestVariant {
  key: string;
  file: string;
  properties: Record<string, string>;
}

export interface ManifestIcon {
  name: string;
  axes: ManifestAxis[];
  variants: ManifestVariant[];
}

export interface IconManifest {
  version: 1;
  icons: ManifestIcon[];
}

const RESERVED = new Set([
  'style',
  'className',
  'color',
  'key',
  'ref',
  'children',
]);
const TYPE_LIKE = /^(style|type|variant|kind|fill|appearance|mode)$/i;

function toCamelCase(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+(.)?/g, (_, next: string) =>
    next ? next.toUpperCase() : ''
  );
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function toNumber(value: string): number {
  const trimmed = value.trim().replace(/px$/i, '');
  return trimmed === '' ? NaN : Number(trimmed);
}

export function toPropValue(value: string, numeric: boolean): string {
  if (numeric) return String(toNumber(value));
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function propNameFor(
  axis: string,
  numeric: boolean,
  taken: Set<string>
): string {
  let name: string;
  if (numeric && /size/i.test(axis)) name = 'size';
  else if (TYPE_LIKE.test(axis.trim())) name = 'type';
  else name = toCamelCase(axis);

  if (RESERVED.has(name)) name = `${name}Variant`;
  while (taken.has(name)) name = `${name}Variant`;
  taken.add(name);
  return name;
}

function defaultValueFor(
  prop: string,
  numeric: boolean,
  values: ManifestAxisValue[]
): string {
  if (numeric && prop === 'size') {
    const sixteen = values.find((value) => value.prop === '16');
    if (sixteen) return sixteen.prop;
  }

  for (const preferred of ['outline', 'default', 'regular', 'normal', 'line']) {
    const match = values.find((value) => value.prop === preferred);
    if (match) return match.prop;
  }
  return values[0]?.prop ?? '';
}

export function planManifestAxes(
  axes: Record<string, string[]>
): ManifestAxis[] {
  const taken = new Set<string>();
  return Object.entries(axes).map(([axis, rawValues]) => {
    const numeric =
      rawValues.length > 0 &&
      rawValues.every((value) => Number.isFinite(toNumber(value)));
    const prop = propNameFor(axis, numeric, taken);
    const values = rawValues.map((figma) => ({
      figma,
      prop: toPropValue(figma, numeric),
    }));
    return {
      axis,
      prop,
      numeric,
      values,
      defaultValue: defaultValueFor(prop, numeric, values),
    };
  });
}

export function manifestVariantKey(
  properties: Record<string, string>,
  axes: ManifestAxis[]
): string {
  return axes
    .map((axis) => {
      const figma = properties[axis.axis] ?? '';
      return (
        axis.values.find((value) => value.figma === figma)?.prop ??
        toPropValue(figma, axis.numeric)
      );
    })
    .join('-');
}

export function manifestFileKey(
  properties: Record<string, string>,
  axes: ManifestAxis[]
): string {
  return axes
    .map((axis) => toPropValue(properties[axis.axis] ?? '', false))
    .join('-');
}

export function toComponentName(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const safe = pascal.replace(/^[^a-zA-Z]+/, '');
  if (!safe) return 'Icon';
  return /^Icon/.test(safe) ? safe : `Icon${safe}`;
}
