# SVG pipeline source

This directory owns the canonical SVG processing shared by the icons build and
the local Figma exporters. Figma-specific code reads selections, frame bounds,
and raw SVG strings; these modules normalize that output, generate the manifest,
and produce React components.

The local Figma workspace resolves `@pierre/svg-pipeline` directly to `index.ts`
at build time. Its build scripts should fail with a clear workspace layout error
when this sibling icons checkout is unavailable.

Canonical SVGs pass through SVGO exactly once in the exporter. Package builds
consume the committed SVG and manifest without optimizing them again.
