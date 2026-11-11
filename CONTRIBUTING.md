# @pierre/icons

`@pierre/icons` is an open source icon library designed first and foremost for
[Diffs.com](https://diffs.com/) by
[The Pierre Computer Company](https://pierre.computer). Available as source SVGs
exported from Figma and as compiled React components.

## Setup

```bash
npm i
```

## Adding icons

1. In Figma, select the icon component sets and run the SVGO Exporter.
2. Replace `beta/svg/` with the archive's `svg/` directory, including
   `beta/svg/manifest.json`.
3. Run `npm run icons`.
4. Commit the canonical SVGs and generated `src/beta/*.tsx` files.
5. Import beta icons from `@pierre/icons/beta`.

```tsx
import { IconArrow, IconCheck } from '@pierre/icons/beta';

<IconArrow size={20} color="red" />;
```

The stable collection remains available from `@pierre/icons`, so applications
can test stable and beta icons side by side:

```tsx
import { IconCheck as StableIconCheck } from '@pierre/icons';
import { IconCheck as BetaIconCheck } from '@pierre/icons/beta';
```

The SVG tree is the source of truth. Visual styles become separate components:
outline is `IconFileBadgeGear`, fill is `IconFileBadgeGearFill`, and duo is
`IconFileBadgeGearDuo`. Each component uses its `size` prop to select the
12/16/24px artwork; there is no generated `type` prop. Badged artwork ships as
individual flattened components, and the build does not add a compositional
`badge` prop or reconstruct SVG masks.

Duo components expose their translucent background and opaque foreground with
stable `.bg` and `.fg` classes. The SVG pipeline also adds those hooks to
known-safe Fill and Outline structures, including separated file/folder badges
and verified container-plus-glyph families. Classification uses component
identity and SVG structure; designers do not need to rename Figma instances or
layers. Single-path and unknown or ambiguous multi-element icons are left
unchanged.

The curated structural rules also cover unread/full indicators, selected
two-pane diff views, Copy sheets, LineGraphArea, Building, Fill sidebars,
two-part Commit fills, Box outlines, and ColorModeAuto. Some rules are
intentionally order-aware or opacity-aware rather than universally
first-element-first. `IconTag` is eligible when its body and dot export as
separate paintables; the current Fill/Outline exports merge them into one path,
so they remain monochrome until a future separated export. Its Duo
classification is unchanged.

All classified layers inherit `currentColor` by default, so monochrome rendering
is unchanged. Use a wrapper class to customize them:

```tsx
<IconFolderBadgePlusFill className="folder-status" />
```

```css
.folder-status .bg {
  color: #2563eb;
}

.folder-status .fg {
  color: #16a34a;
}
```

The source SVG keeps its designed opacity; the layer classes only change which
`currentColor` each layer receives. Re-exporting through either Figma exporter
or rebuilding the canonical SVG locally applies the same idempotent pass. Fill
and Outline layers remain at full authored opacity; only Duo keeps its authored
translucent background. The preview's Multi switch changes colors only.

SVGs exported with `overflow="visible"` keep that behavior in generated React
components and sprite symbols. The npm scripts do not optimize canonical SVGs a
second time. Until the existing flat collection is migrated, `icons:build` and
`icons:sprite` continue to support flat `svg/IconName.svg` input when no
manifest is present.

## Scripts

| Command                 | Description                                 |
| ----------------------- | ------------------------------------------- |
| `npm run icons`         | Build components, sprite, and preview       |
| `npm run icons:build`   | Generate stable and beta React components   |
| `npm run icons:layers`  | Persist structural `.bg`/`.fg` SVG hooks    |
| `npm run icons:sprite`  | Generate one SVG symbol per icon variant    |
| `npm run icons:preview` | Generate HTML preview                       |
| `npm run build`         | Clean dist, generate components, compile TS |
| `npm run clean`         | Remove dist folder                          |
| `npm run lint`          | Run ESLint                                  |
| `npm run format`        | Run Prettier                                |

## Icon props

```tsx
interface IconProps {
  size?: number | string; // default: 16
  color?: string; // default: 'currentcolor'
  style?: CSSProperties;
  className?: string;
}
```

## Preview

After building, open `dist/index.html` in a browser to browse all icons.
