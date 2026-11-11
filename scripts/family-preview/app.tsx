import {
  type CSSProperties,
  type JSX,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';

import {
  type LayoutNode,
  LayoutStore,
  type PaneNode,
  getPanes,
} from '../../vendor/pierre-layouts/src/index.ts';
import { Layout } from '../../vendor/pierre-layouts/src/react/index.tsx';

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

declare global {
  interface Window {
    __PIERRE_ICON_FAMILIES__: PreviewFamily[];
  }
}

interface IconCategory {
  id: string;
  title: string;
  test: RegExp;
}

const categories: IconCategory[] = [
  {
    id: 'files',
    title: 'Files & folders',
    test: /(File|Folder|Archive|Zip|Document|Book|Clipboard|Paperclip)/,
  },
  {
    id: 'communication',
    title: 'Communication',
    test: /(Comment|Envelope|Mail|Message|Chat|Bell|Inbox|Phone|Mic|Broadcast|Rss|Send|Emoji|At$)/,
  },
  {
    id: 'git',
    title: 'Git & source control',
    test: /(Git|Branch|Commit|Merge|Pull|Push|State|Diff|Conflict|Fork|Repository|Squircle(Added|Modified|Renamed|Deleted|Diffstat))/,
  },
  {
    id: 'navigation',
    title: 'Navigation & movement',
    test: /(Arrow|Chevron|Caret|Expand|Contract|Collapse|Sort|Move|Direction)/,
  },
  {
    id: 'editing',
    title: 'Editing & content',
    test: /(Text|Type|Align|List|Indent|Quote|Code|Link|Unlink|Image|Crop|Pen|Pencil|Edit|Delete|Trash|Copy|Paste|Selection)/,
  },
  {
    id: 'identity',
    title: 'People & security',
    test: /(Lock|Shield|Key|Eye|User|Person|Team|Face|Fingerprint)/,
  },
  {
    id: 'data',
    title: 'Charts & data',
    test: /(Chart|Graph|Logs|Spreadsheet)/,
  },
  {
    id: 'status',
    title: 'Status & feedback',
    test: /(Circle|Squircle|Triangle|Check|Bang|Question|Info|Plus|Minus|Slash|Heart|Star|Flag|Fire|Bulb|LifeRaft|X$)/,
  },
  {
    id: 'system',
    title: 'System & layout',
    test: /.*/,
  },
];

const families = window.__PIERRE_ICON_FAMILIES__;
const groupedFamilies = new Map(
  categories.map((category) => [category.id, [] as PreviewFamily[]])
);

for (const family of families) {
  const category =
    categories.find(({ test }) => test.test(family.componentName)) ??
    categories[categories.length - 1];
  groupedFamilies.get(category.id)?.push(family);
}

function categoryPane(category: IconCategory): PaneNode {
  return {
    type: 'pane',
    id: `family-${category.id}`,
    minWidth: 240,
    minHeight: 180,
  };
}

function buildLayout(
  panes: PaneNode[],
  depth = 0,
  splitIndex = { value: 0 }
): LayoutNode {
  if (panes.length === 1) return panes[0];
  const middle = Math.ceil(panes.length / 2);
  const first = panes.slice(0, middle);
  const second = panes.slice(middle);
  splitIndex.value += 1;
  return {
    type: 'split',
    id: `family-split-${splitIndex.value}`,
    direction: depth % 2 === 0 ? 'horizontal' : 'vertical',
    ratio: first.length / panes.length,
    first: buildLayout(first, depth + 1, splitIndex),
    second: buildLayout(second, depth + 1, splitIndex),
  };
}

function freshLayout(): LayoutNode {
  return buildLayout(categories.map(categoryPane));
}

const store = new LayoutStore(freshLayout());
const previewPaneId = 'icon-preview';
const previewSplitId = 'icon-preview-split';
const multiColors = [
  ['#009fff', '#0dbe4e'],
  ['#fc2b73', '#c635e4'],
  ['#7b43f8', '#a13cee'],
  ['#fe8c2c', '#ffab16'],
];

function preferredVariant(family: PreviewFamily): PreviewVariant {
  return (
    family.variants.find((variant) => variant.name === 'outline') ??
    family.variants[0]
  );
}

function preferredSize(variant: PreviewVariant): string {
  return variant.sizes.includes('16px')
    ? '16px'
    : variant.sizes[variant.sizes.length - 1];
}

function iconMarkup(family: PreviewFamily): string {
  const variant = preferredVariant(family);
  return variant.svg[preferredSize(variant)];
}

function categoryForPane(pane: PaneNode): IconCategory | undefined {
  return categories.find(({ id }) => pane.id === `family-${id}`);
}

function IconGrid({
  category,
  query,
  onOpen,
}: {
  category: IconCategory;
  query: string;
  onOpen: (family: PreviewFamily) => void;
}): JSX.Element {
  const matches = (groupedFamilies.get(category.id) ?? []).filter((family) =>
    family.displayName.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    return <p className="empty-family">No matching icons</p>;
  }

  return (
    <div className="icon-grid">
      {matches.map((family) => (
        <button
          className="icon-card"
          type="button"
          key={family.componentName}
          onClick={() => onOpen(family)}
          title={`Open ${family.displayName} in a pane`}
        >
          <span
            className="icon-glyph"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: iconMarkup(family) }}
          />
          <span>{family.displayName}</span>
        </button>
      ))}
    </div>
  );
}

function DetailPane({ family }: { family: PreviewFamily }): JSX.Element {
  const initialVariant = preferredVariant(family);
  const [variantName, setVariantName] = useState(initialVariant.name);
  const variant =
    family.variants.find((candidate) => candidate.name === variantName) ??
    initialVariant;
  const [requestedSize, setRequestedSize] = useState(preferredSize(variant));
  const size = variant.sizes.includes(requestedSize)
    ? requestedSize
    : preferredSize(variant);
  const [mode, setMode] = useState<'react' | 'svg'>('react');
  const [multi, setMulti] = useState(false);
  const hasMulti =
    variant.svg[size].includes('class="bg"') &&
    variant.svg[size].includes('class="fg"');
  const colorIndex = family.componentName.length % multiColors.length;
  const [background, foreground] = multiColors[colorIndex];
  const sourceHtml =
    mode === 'react' ? variant.reactSourceHtml : variant.svgSourceHtml[size];

  return (
    <div
      className="detail-pane"
      data-multi={multi && hasMulti}
      style={
        {
          '--multi-bg': background,
          '--multi-fg': foreground,
        } as CSSProperties
      }
    >
      <div className="detail-preview">
        <div className="detail-controls">
          <div className="segmented" aria-label="Icon variant">
            {family.variants.map((candidate) => (
              <button
                key={candidate.name}
                type="button"
                aria-pressed={variant.name === candidate.name}
                onClick={() => setVariantName(candidate.name)}
              >
                {candidate.name}
              </button>
            ))}
          </div>
          <div className="segmented" aria-label="Icon size">
            {variant.sizes.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={size === candidate}
                onClick={() => setRequestedSize(candidate)}
              >
                {candidate.replace('px', '')}
              </button>
            ))}
          </div>
        </div>
        <div
          className="detail-glyph"
          aria-label={`${variant.reactName} preview`}
          dangerouslySetInnerHTML={{ __html: variant.svg[size] }}
        />
        <button
          type="button"
          className="multi-toggle"
          aria-pressed={multi && hasMulti}
          disabled={!hasMulti}
          onClick={() => setMulti((value) => !value)}
        >
          Multi-color
        </button>
      </div>
      <div className="source-panel">
        <div className="segmented source-mode" aria-label="Source format">
          {(['react', 'svg'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={mode === candidate}
              onClick={() => setMode(candidate)}
            >
              {candidate === 'react' ? 'React' : 'SVG'}
            </button>
          ))}
        </div>
        <div
          className="source-code"
          dangerouslySetInnerHTML={{ __html: sourceHtml }}
        />
      </div>
    </div>
  );
}

function App(): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<
    PreviewFamily | undefined
  >();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
  const visibleCount = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return families.filter((family) =>
      family.displayName.toLowerCase().includes(normalized)
    ).length;
  }, [query]);

  function openPreview(family: PreviewFamily): void {
    setSelectedFamily(family);
    const layoutState = store.getSnapshot();
    if (getPanes(layoutState.root).some((pane) => pane.id === previewPaneId)) {
      store.focusPane(previewPaneId);
      return;
    }
    store.setRoot({
      type: 'split',
      id: previewSplitId,
      direction: 'horizontal',
      ratio: 0.64,
      first: layoutState.root,
      second: {
        type: 'pane',
        id: previewPaneId,
        minWidth: 380,
        minHeight: 320,
      },
    });
    store.focusPane(previewPaneId);
  }

  function resetLayout(): void {
    setSelectedFamily(undefined);
    store.setRoot(freshLayout());
  }

  return (
    <main className="app-shell">
      <header className="toolbar">
        <div className="brand">
          <strong>@pierre/icons</strong>
          <span>Family workspace · {visibleCount} icons</span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search every pane…"
          aria-label="Search icons"
        />
        <button type="button" className="toolbar-button" onClick={resetLayout}>
          Reset layout
        </button>
        <span className="pane-count">{getPanes(state.root).length} panes</span>
      </header>
      <div className="workspace">
        <Layout
          store={store}
          canClosePane={(pane) => pane.id === previewPaneId}
          getPaneTitle={(pane) =>
            categoryForPane(pane)?.title ??
            (pane.id === previewPaneId
              ? (selectedFamily?.displayName ?? 'Icon preview')
              : pane.id)
          }
          label="Icon family workspace"
          renderPane={(pane) => {
            const category = categoryForPane(pane);
            if (category !== undefined) {
              return (
                <IconGrid
                  category={category}
                  query={query.trim().toLowerCase()}
                  onOpen={openPreview}
                />
              );
            }
            return pane.id === previewPaneId && selectedFamily !== undefined ? (
              <DetailPane
                key={selectedFamily.componentName}
                family={selectedFamily}
              />
            ) : null;
          }}
        />
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('Missing family preview root');
createRoot(root).render(<App />);
