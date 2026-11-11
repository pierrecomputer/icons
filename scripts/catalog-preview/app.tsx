import { type CSSProperties, type JSX, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  type LayoutNode,
  LayoutStore,
  type PaneNode,
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

interface Category {
  id: string;
  title: string;
  symbol: string;
  test: RegExp;
}

declare global {
  interface Window {
    __PIERRE_ICON_FAMILIES__: PreviewFamily[];
  }
}

const categories: Category[] = [
  { id: 'all', title: 'All Icons', symbol: '⌘', test: /.*/ },
  {
    id: 'files',
    title: 'Files & Folders',
    symbol: '□',
    test: /(File|Folder|Archive|Zip|Document|Book|Clipboard|Paperclip)/,
  },
  {
    id: 'communication',
    title: 'Communication',
    symbol: '◯',
    test: /(Comment|Envelope|Mail|Message|Chat|Bell|Inbox|Phone|Mic|Broadcast|Rss|Send|Emoji|At$)/,
  },
  {
    id: 'git',
    title: 'Git & Source Control',
    symbol: '⑂',
    test: /(Git|Branch|Commit|Merge|Pull|Push|State|Diff|Conflict|Fork|Repository|Squircle(Added|Modified|Renamed|Deleted|Diffstat))/,
  },
  {
    id: 'navigation',
    title: 'Navigation',
    symbol: '→',
    test: /(Arrow|Chevron|Caret|Expand|Contract|Collapse|Sort|Move|Direction)/,
  },
  {
    id: 'editing',
    title: 'Editing & Content',
    symbol: '✎',
    test: /(Text|Type|Align|List|Indent|Quote|Code|Link|Unlink|Image|Crop|Pen|Pencil|Edit|Delete|Trash|Copy|Paste|Selection)/,
  },
  {
    id: 'identity',
    title: 'People & Security',
    symbol: '◇',
    test: /(Lock|Shield|Key|Eye|User|Person|Team|Face|Fingerprint)/,
  },
  {
    id: 'data',
    title: 'Charts & Data',
    symbol: '▥',
    test: /(Chart|Graph|Logs|Spreadsheet)/,
  },
  {
    id: 'status',
    title: 'Status & Feedback',
    symbol: '!',
    test: /(Circle|Squircle|Triangle|Check|Bang|Question|Info|Plus|Minus|Slash|Heart|Star|Flag|Fire|Bulb|LifeRaft|X$)/,
  },
  { id: 'system', title: 'System & Layout', symbol: '⌗', test: /.*/ },
];

const families = window.__PIERRE_ICON_FAMILIES__;
const catalogLayout: LayoutNode = {
  type: 'split',
  id: 'catalog-root',
  direction: 'horizontal',
  ratio: 0.18,
  first: {
    type: 'pane',
    id: 'categories',
    minWidth: 170,
    minHeight: 240,
  },
  second: {
    type: 'split',
    id: 'catalog-content',
    direction: 'horizontal',
    ratio: 0.74,
    first: {
      type: 'pane',
      id: 'browser',
      minWidth: 420,
      minHeight: 240,
    },
    second: {
      type: 'pane',
      id: 'inspector',
      minWidth: 250,
      minHeight: 240,
    },
  },
};
const catalogStore = new LayoutStore(catalogLayout);

function categoryId(family: PreviewFamily): string {
  return (
    categories
      .slice(1)
      .find((category) => category.test.test(family.componentName))?.id ??
    'system'
  );
}

function defaultVariant(family: PreviewFamily): PreviewVariant {
  return (
    family.variants.find((variant) => variant.name === 'outline') ??
    family.variants[0]
  );
}

function defaultSize(variant: PreviewVariant): string {
  return variant.sizes.includes('24px')
    ? '24px'
    : variant.sizes[variant.sizes.length - 1];
}

function familyMarkup(family: PreviewFamily): string {
  const variant = defaultVariant(family);
  return variant.svg[defaultSize(variant)];
}

function App(): JSX.Element {
  const firstFamily = families[0];
  const firstVariant = defaultVariant(firstFamily);
  const [activeCategory, setActiveCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [tileSize, setTileSize] = useState(94);
  const [selectedName, setSelectedName] = useState(firstFamily.componentName);
  const [variantName, setVariantName] = useState(firstVariant.name);
  const [requestedSize, setRequestedSize] = useState(defaultSize(firstVariant));
  const [inspectorSection, setInspectorSection] = useState<
    'variants' | 'usage' | 'details' | null
  >('variants');
  const [sourceMode, setSourceMode] = useState<'react' | 'svg'>('react');
  const selectedFamily =
    families.find((family) => family.componentName === selectedName) ??
    firstFamily;
  const selectedVariant =
    selectedFamily.variants.find((variant) => variant.name === variantName) ??
    defaultVariant(selectedFamily);
  const selectedSize = selectedVariant.sizes.includes(requestedSize)
    ? requestedSize
    : defaultSize(selectedVariant);
  const selectedSourceHtml =
    sourceMode === 'react'
      ? selectedVariant.reactSourceHtml
      : selectedVariant.svgSourceHtml[selectedSize];
  const activeCategoryData =
    categories.find((category) => category.id === activeCategory) ??
    categories[0];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFamilies = useMemo(
    () =>
      families.filter(
        (family) =>
          (activeCategory === 'all' || categoryId(family) === activeCategory) &&
          `${family.displayName} ${family.componentName}`
            .toLowerCase()
            .includes(normalizedQuery)
      ),
    [activeCategory, normalizedQuery]
  );
  const categoryCounts = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          category.id === 'all'
            ? families.length
            : families.filter((family) => categoryId(family) === category.id)
                .length,
        ])
      ),
    []
  );

  function selectFamily(family: PreviewFamily): void {
    const variant = defaultVariant(family);
    setSelectedName(family.componentName);
    setVariantName(variant.name);
    setRequestedSize(defaultSize(variant));
  }

  const categoryPane = (
    <aside className="sidebar" aria-label="Icon categories">
      <p className="sidebar-label">Browse</p>
      <nav>
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            aria-pressed={activeCategory === category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            <span className="category-symbol" aria-hidden="true">
              {category.symbol}
            </span>
            <span>{category.title}</span>
            <small>{categoryCounts.get(category.id)}</small>
          </button>
        ))}
      </nav>
    </aside>
  );

  const browserPane = (
    <section className="catalog-main">
      <div className="catalog-heading">
        <div>
          <h1>{activeCategoryData.title}</h1>
          <p>
            {visibleFamilies.length}{' '}
            {visibleFamilies.length === 1 ? 'family' : 'families'}
          </p>
        </div>
      </div>
      {visibleFamilies.length === 0 ? (
        <div className="empty-catalog">No matching icons</div>
      ) : view === 'grid' ? (
        <div
          className="symbol-grid"
          style={{ '--tile-size': `${tileSize}px` } as CSSProperties}
        >
          {visibleFamilies.map((family) => (
            <button
              type="button"
              className="symbol-card"
              data-selected={family.componentName === selectedName}
              key={family.componentName}
              onClick={() => selectFamily(family)}
            >
              <span
                className="symbol-tile"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: familyMarkup(family) }}
              />
              <span>{family.displayName}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="symbol-list">
          {visibleFamilies.map((family) => (
            <button
              type="button"
              data-selected={family.componentName === selectedName}
              key={family.componentName}
              onClick={() => selectFamily(family)}
            >
              <span
                className="list-glyph"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: familyMarkup(family) }}
              />
              <span className="list-name">
                <strong>{family.displayName}</strong>
                <small>{family.componentName}</small>
              </span>
              <span className="list-variants">
                {family.variants.map((variant) => variant.name).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const inspectorPane = (
    <aside className="inspector" aria-label="Selected icon">
      <header>
        <strong>{selectedFamily.displayName}</strong>
        <span>
          {selectedFamily.variants.length}{' '}
          {selectedFamily.variants.length === 1 ? 'variant' : 'variants'}
        </span>
      </header>
      <div className="inspector-preview">
        <div
          className="inspector-glyph"
          aria-label={`${selectedVariant.reactName} preview`}
          dangerouslySetInnerHTML={{
            __html: selectedVariant.svg[selectedSize],
          }}
        />
      </div>
      <div className="inspector-controls">
        <div className="segmented" aria-label="Icon variant">
          {selectedFamily.variants.map((variant) => (
            <button
              type="button"
              key={variant.name}
              aria-pressed={selectedVariant.name === variant.name}
              onClick={() => setVariantName(variant.name)}
            >
              {variant.name}
            </button>
          ))}
        </div>
        <div className="segmented" aria-label="Icon size">
          {selectedVariant.sizes.map((size) => (
            <button
              type="button"
              key={size}
              aria-pressed={selectedSize === size}
              onClick={() => setRequestedSize(size)}
            >
              {size.replace('px', '')}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector-sections">
        <button
          type="button"
          aria-expanded={inspectorSection === 'variants'}
          onClick={() =>
            setInspectorSection((section) =>
              section === 'variants' ? null : 'variants'
            )
          }
        >
          <span>Variants</span>
          <span>{inspectorSection === 'variants' ? '⌄' : '›'}</span>
        </button>
        {inspectorSection === 'variants' && (
          <div className="variant-list">
            {selectedFamily.variants.map((variant) => {
              const size = variant.sizes.includes(selectedSize)
                ? selectedSize
                : defaultSize(variant);
              return (
                <button
                  type="button"
                  key={variant.name}
                  data-selected={variant.name === selectedVariant.name}
                  onClick={() => setVariantName(variant.name)}
                >
                  <span
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: variant.svg[size] }}
                  />
                  <span>
                    <strong>{variant.name}</strong>
                    <small>{variant.reactName}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          aria-expanded={inspectorSection === 'usage'}
          onClick={() =>
            setInspectorSection((section) =>
              section === 'usage' ? null : 'usage'
            )
          }
        >
          <span>Usage</span>
          <span>{inspectorSection === 'usage' ? '⌄' : '›'}</span>
        </button>
        {inspectorSection === 'usage' && (
          <div className="usage-panel">
            <span>Import from the beta collection</span>
            <code>
              {'<'}
              {selectedVariant.reactName} size=
              {'{'}
              {selectedSize.replace('px', '')}
              {'}'} /{'>'}
            </code>
          </div>
        )}
        <button
          type="button"
          aria-expanded={inspectorSection === 'details'}
          onClick={() =>
            setInspectorSection((section) =>
              section === 'details' ? null : 'details'
            )
          }
        >
          <span>Details</span>
          <span>{inspectorSection === 'details' ? '⌄' : '›'}</span>
        </button>
        {inspectorSection === 'details' && (
          <dl className="inspector-metadata">
            <div>
              <dt>Component</dt>
              <dd>{selectedVariant.reactName}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>
                {categories.find(
                  (category) => category.id === categoryId(selectedFamily)
                )?.title ?? 'System & Layout'}
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{selectedSize}</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{selectedVariant.sizes.join(' · ')}</dd>
            </div>
          </dl>
        )}
      </div>
      <section className="inspector-source">
        <header>
          <strong>Source</strong>
          <div className="segmented" aria-label="Source format">
            {(['react', 'svg'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                aria-pressed={sourceMode === mode}
                onClick={() => setSourceMode(mode)}
              >
                {mode === 'react' ? 'React' : 'SVG'}
              </button>
            ))}
          </div>
        </header>
        <div
          className="inspector-source-code"
          dangerouslySetInnerHTML={{ __html: selectedSourceHtml }}
        />
      </section>
    </aside>
  );

  function renderPane(pane: PaneNode): JSX.Element | null {
    if (pane.id === 'categories') return categoryPane;
    if (pane.id === 'browser') return browserPane;
    if (pane.id === 'inspector') return inspectorPane;
    return null;
  }

  return (
    <main className="catalog-app">
      <header className="topbar">
        <div className="catalog-brand">
          <strong>@pierre/icons</strong>
          <span>Catalog · {families.length} families</span>
        </div>
        <div className="view-controls" aria-label="Catalog view">
          <button
            type="button"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            title="Grid view"
          >
            ▦
          </button>
          <button
            type="button"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            title="List view"
          >
            ☷
          </button>
        </div>
        <label className="density-control">
          <span aria-hidden="true">A</span>
          <input
            type="range"
            min="74"
            max="132"
            value={tileSize}
            onChange={(event) => setTileSize(Number(event.target.value))}
            aria-label="Icon tile size"
          />
          <span aria-hidden="true">A</span>
        </label>
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search icons"
          />
        </label>
      </header>
      <div className="catalog-workspace">
        <Layout
          store={catalogStore}
          label="Icon catalog"
          getPaneTitle={(pane) =>
            pane.id === 'categories'
              ? 'Categories'
              : pane.id === 'browser'
                ? activeCategoryData.title
                : selectedFamily.displayName
          }
          renderPane={renderPane}
        />
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('Missing icon catalog root');
createRoot(root).render(<App />);
