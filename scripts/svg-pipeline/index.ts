// Vendored from pierrecomputer/figma packages/svg-pipeline.
// Keep these exports aligned until the shared package has a permanent home.
export {
  addDuoLayerClasses,
  addIconLayerClasses,
  iconLayerStyle,
  prefixSvgIds,
  readSvgRoot,
  referencedSvgIds,
} from './artwork.ts';
export type { IconLayerContext, IconLayerStyle, SvgRoot } from './artwork.ts';
export { manifestVariantKey } from './manifest.ts';
export type {
  IconManifest,
  ManifestAxis,
  ManifestAxisValue,
  ManifestIcon,
  ManifestVariant,
} from './manifest.ts';
export { generateReactIcon, generateReactIndex } from './react.ts';
export type { ReactVariant } from './react.ts';
