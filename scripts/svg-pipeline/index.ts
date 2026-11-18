// Canonical SVG processing shared by the icons build and local Figma plugins.
export {
  applyLayerNameClasses,
  cleanFigmaSvg,
  isWrapperGroup,
  optimizeSvg,
  removeGroupWrappers,
  removeUnreferencedIds,
  sanitizeClassName,
} from './clean.js';
export { loadConfig, normalizeConfigUrl, parseJsConfig } from './config.js';
export type { Config } from './config.js';
export {
  addDuoLayerClasses,
  addIconLayerClasses,
  fitSvgToFrame,
  iconLayerStyle,
  normalizeSvgPaints,
  prefixSvgIds,
  protectMaskPaint,
  readSvgRoot,
  referencedSvgIds,
  restoreMaskPaint,
} from './artwork.js';
export type {
  FrameBox,
  IconLayerContext,
  IconLayerStyle,
  SvgRoot,
} from './artwork.js';
export {
  manifestFileKey,
  manifestVariantKey,
  planManifestAxes,
  toComponentName,
  toPropValue,
} from './manifest.js';
export type {
  IconManifest,
  ManifestAxis,
  ManifestAxisValue,
  ManifestIcon,
  ManifestVariant,
} from './manifest.js';
export { generateReactIcon, generateReactIndex } from './react.js';
export type { ReactVariant } from './react.js';
