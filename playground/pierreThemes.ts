/**
 * Bridges `@pierre/theme` onto the CSS custom properties this library reads.
 *
 * The open-source Pierre themes ship as VS Code / Shiki theme objects, so their
 * colors are keyed by workbench name (`editor.background`,
 * `gitDecoration.addedResourceForeground`) rather than by the `--color-*` and
 * `--ui-theme-*` variables that `Colors` in src/types.ts resolves against.
 * This file is the only place that knows both vocabularies: the icons keep
 * asking for `var(--ui-theme-success-icon)` and this decides what that means.
 *
 * The status colors deliberately come from the `gitDecoration.*` keys — the
 * same ones the editor uses to tint a changed file in the tree — so a status
 * icon matches the row it sits next to.
 */
import pierreDark from '@pierre/theme/pierre-dark';
import pierreDarkProtanopiaDeuteranopia from '@pierre/theme/pierre-dark-protanopia-deuteranopia';
import pierreDarkSoft from '@pierre/theme/pierre-dark-soft';
import pierreDarkTritanopia from '@pierre/theme/pierre-dark-tritanopia';
import pierreDarkVibrant from '@pierre/theme/pierre-dark-vibrant';
import pierreLight from '@pierre/theme/pierre-light';
import pierreLightProtanopiaDeuteranopia from '@pierre/theme/pierre-light-protanopia-deuteranopia';
import pierreLightSoft from '@pierre/theme/pierre-light-soft';
import pierreLightTritanopia from '@pierre/theme/pierre-light-tritanopia';
import pierreLightVibrant from '@pierre/theme/pierre-light-vibrant';

type PierreTheme = typeof pierreLight;

const SOURCE_THEMES: PierreTheme[] = [
  pierreLight,
  pierreLightSoft,
  pierreLightVibrant,
  pierreLightProtanopiaDeuteranopia,
  pierreLightTritanopia,
  pierreDark,
  pierreDarkSoft,
  pierreDarkVibrant,
  pierreDarkProtanopiaDeuteranopia,
  pierreDarkTritanopia,
];

function toCssVars(theme: PierreTheme): Record<string, string> {
  const color = (key: string): string => {
    const value = theme.colors[key];
    if (value == null) {
      throw new Error(`Theme "${theme.name}" has no color for "${key}"`);
    }
    return value;
  };

  const fg = color('editor.foreground');
  const bg = color('editor.background');
  const muted = color('editorLineNumber.foreground');
  const border = color('input.border');

  /** Fade a theme color toward its own background, for steps it doesn't name. */
  const toward = (from: string, percent: number) =>
    `color-mix(in oklab, ${from} ${percent}%, ${bg})`;

  return {
    '--color-black': '#000000',
    '--color-white': '#ffffff',

    '--color-fg': fg,
    '--color-fg1': color('editorLineNumber.activeForeground'),
    '--color-fg2': muted,
    '--color-fg3': toward(muted, 70),
    '--color-fg4': border,

    '--color-bg': bg,
    '--color-bg-raised': color('sideBar.background'),
    '--color-bg-sunken': color('input.background'),
    '--color-border': border,

    '--ui-theme-primary-icon': color(
      'gitDecoration.modifiedResourceForeground'
    ),
    '--ui-theme-success-icon': color('gitDecoration.addedResourceForeground'),
    '--ui-theme-danger-icon': color('gitDecoration.deletedResourceForeground'),
    '--ui-theme-warning-icon': color('notificationsWarningIcon.foreground'),

    '--checker': toward(fg, 8),
  };
}

export interface PlaygroundTheme {
  name: string;
  displayName: string;
  type: 'light' | 'dark';
  vars: Record<string, string>;
}

export const PIERRE_THEMES: PlaygroundTheme[] = SOURCE_THEMES.map((theme) => ({
  name: theme.name,
  displayName: theme.displayName,
  type: theme.type,
  vars: toCssVars(theme),
}));

export const DEFAULT_THEME = PIERRE_THEMES[0];

export function applyTheme(theme: PlaygroundTheme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.vars)) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.type;
}
