import * as Icons from '@pierre/icons';
import {
  Colors,
  FILE_STATUSES,
  type FileStatus,
  IconFileStatus,
  type IconFileStatusProps,
  type IconProps,
} from '@pierre/icons';
import {
  type ComponentType,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DEFAULT_THEME, PIERRE_THEMES, applyTheme } from './pierreThemes';

type IconComponent = ComponentType<IconProps>;

const SIZES = [12, 16, 20, 32, 48];
const COLOR_OPTIONS = Object.keys(Colors);

/** The pre-composed icons this component is meant to replace. */
const ORIGINALS: Record<FileStatus, IconComponent> = {
  dot: Icons.IconFileStatusDot,
  square: Icons.IconFileStatusSquare,
  triangle: Icons.IconFileStatusTriangle,
  added: Icons.IconFileStatusA,
  deleted: Icons.IconFileStatusD,
  modified: Icons.IconFileStatusM,
  untracked: Icons.IconFileStatusU,
};

/**
 * A realistic changed-files list, the composition this is really built for.
 * The snippet on each row is derived from the props it renders with, so the
 * two can never drift apart.
 */
const CHANGED_FILES: { path: string; props: IconFileStatusProps }[] = [
  {
    path: 'src/composites/IconFileStatus.tsx',
    props: { status: 'added', size: 16 },
  },
  { path: 'src/index.ts', props: { status: 'modified', size: 16 } },
  { path: 'scripts/build-preview.ts', props: { status: 'deleted', size: 16 } },
  { path: 'playground/App.tsx', props: { status: 'untracked', size: 16 } },
  {
    path: 'svg/IconFile.svg',
    props: { status: 'dot', size: 16, statusColor: 'yellow' },
  },
  {
    path: 'README',
    props: { status: 'triangle', size: 16, color: 'fg3' },
  },
];

function formatJsx(props: IconFileStatusProps) {
  const attrs = Object.entries(props)
    .map(([key, value]) =>
      typeof value === 'number' ? `${key}={${value}}` : `${key}="${value}"`
    )
    .join(' ');
  return `<IconFileStatus ${attrs} />`;
}

const ALL_ICONS = (Object.entries(Icons) as [string, unknown][])
  .filter(
    ([name, value]) =>
      name.startsWith('Icon') &&
      name !== 'IconFileStatus' &&
      typeof value === 'function'
  )
  .sort(([a], [b]) => a.localeCompare(b)) as [string, IconComponent][];

export function App() {
  const [themeName, setThemeName] = useState(DEFAULT_THEME.name);
  const [status, setStatus] = useState<FileStatus>('modified');
  const [size, setSize] = useState(32);
  const [color, setColor] = useState('currentcolor');
  const [statusColor, setStatusColor] = useState('');
  const [debugSafeArea, setDebugSafeArea] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const theme = PIERRE_THEMES.find(({ name }) => name === themeName);
    if (theme) applyTheme(theme);
  }, [themeName]);

  useEffect(() => {
    if (copied == null) return;
    const timer = setTimeout(() => setCopied(null), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  const visibleIcons = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return ALL_ICONS;
    return ALL_ICONS.filter(([name]) => name.toLowerCase().includes(needle));
  }, [deferredQuery]);

  const shared = {
    color,
    statusColor: statusColor || undefined,
    debugSafeArea,
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>@pierre/icons playground</h1>
          <p>
            Layered file-status icons, rendered from source with HMR and colored
            by the real themes from <code>@pierre/theme</code>.
          </p>
        </div>
        <label className="field">
          <span>Theme</span>
          <select
            value={themeName}
            onChange={(event) => setThemeName(event.target.value)}
          >
            {(['light', 'dark'] as const).map((type) => (
              <optgroup key={type} label={type === 'light' ? 'Light' : 'Dark'}>
                {PIERRE_THEMES.filter((theme) => theme.type === type).map(
                  (theme) => (
                    <option key={theme.name} value={theme.name}>
                      {theme.displayName}
                    </option>
                  )
                )}
              </optgroup>
            ))}
          </select>
        </label>
      </header>

      <section className="section">
        <h2>Usage</h2>
        <p>
          One component, one required prop. Both layers default to{' '}
          <code>currentcolor</code>, so an icon inherits from whatever it sits
          in and the indicator only diverges when a status gives it meaning.
        </p>

        <ul className="usage">
          {CHANGED_FILES.map(({ path, props }) => (
            <li key={path}>
              <IconFileStatus {...props} />
              <span className="usage-path">{path}</span>
              <code>{formatJsx(props)}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Composite</h2>
        <p>
          One shared file body plus an indicator layer, composited at render
          time. Each indicator masks its own notch out of the body — the glyph
          outset by 2 units — so the two layers never touch and each can be
          colored independently.
        </p>

        <div className="controls">
          <label className="field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as FileStatus)}
            >
              {FILE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Size</span>
            <select
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            >
              {SIZES.map((value) => (
                <option key={value} value={value}>
                  {value}px
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Body color</span>
            <select
              value={color}
              onChange={(event) => setColor(event.target.value)}
            >
              {COLOR_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Status color</span>
            <select
              value={statusColor}
              onChange={(event) => setStatusColor(event.target.value)}
            >
              <option value="">auto (semantic)</option>
              {COLOR_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field checkbox">
            <input
              type="checkbox"
              checked={debugSafeArea}
              onChange={(event) => setDebugSafeArea(event.target.checked)}
            />
            <span>Show safe area</span>
          </label>
        </div>

        <div className="stage">
          {SIZES.map((value) => (
            <figure key={value}>
              <IconFileStatus status={status} size={value} {...shared} />
              <figcaption>{value}px</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>All statuses</h2>
        <p>
          Every indicator layered onto the same body at {size}px. Shape
          indicators stay neutral by default; the letterforms carry semantic
          color.
        </p>
        <div className="stage">
          {FILE_STATUSES.map((value) => (
            <figure key={value}>
              <IconFileStatus status={value} size={size} {...shared} />
              <figcaption>{value}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Composite vs. original</h2>
        <p>
          Side by side with the existing pre-composed icons, which are still
          shipped untouched. Because each notch is now derived from its own
          indicator, these should read as the same icon.
        </p>
        <div className="compare">
          {FILE_STATUSES.map((value) => {
            const Original = ORIGINALS[value];
            return (
              <div className="compare-cell" key={value}>
                <div className="compare-pair">
                  <div>
                    <IconFileStatus status={value} size={32} {...shared} />
                    <small>new</small>
                  </div>
                  <div>
                    <Original size={32} color={color} />
                    <small>original</small>
                  </div>
                </div>
                <code>{value}</code>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>All icons ({visibleIcons.length})</h2>
        <p>
          Every generated component in the library. Click one to copy its name.
        </p>
        <div className="controls">
          <input
            type="search"
            placeholder="Search icons…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {visibleIcons.length === 0 ? (
          <p className="empty">No icons match “{query}”.</p>
        ) : (
          <div className="grid">
            {visibleIcons.map(([name, Icon]) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => {
                  void navigator.clipboard.writeText(name);
                  setCopied(name);
                }}
              >
                <Icon size={24} color={color} />
                <span>{copied === name ? 'Copied!' : name}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
