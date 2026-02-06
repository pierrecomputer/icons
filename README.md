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

1. Drop SVG files into `svg/`
2. Run `npm run icons`
3. Import from `@pierre/icons`

```tsx
import { IconArrow, IconCheck } from '@pierre/icons';

<IconArrow size={20} color="red" />;
```

## Scripts

| Command                 | Description                                 |
| ----------------------- | ------------------------------------------- |
| `npm run icons`         | Build components, sprite, and preview       |
| `npm run icons:build`   | Generate React components from SVGs         |
| `npm run icons:sprite`  | Generate SVG sprite                         |
| `npm run icons:preview` | Generate HTML preview                       |
| `npm run build`         | Full build (icons, TypeScript, and preview) |
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
