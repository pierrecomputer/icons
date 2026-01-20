# Icons repo

### Goal
Single source of truth for icon SVGs and React components

### Why
- Duplicate icon processing scripts
- Outdated icons in different projects
- No clear way to upgrade icons if you’re not me
- No way to preserve customizations in the React components

### Solution
- Make a new pierrecomputer/icons repo
- Check in all SVGs so everyone has them (right now they’re ignored by git in all projects)
- Single set of scripts for processing icons into optimized SVGs and React components
- npm package for importing, versioning, updating, etc

### Figma tangent
Two-part tangent: cleaning up the Icons page in our DS file (in progress), and better supporting the export flow for less work on my end.

- I want to create a custom Figma plugin for configuring SVG exports.
- This would take named layers and apply them as `class`  props on specific paths in the exported SVG.
- Class values would be retained in the React conversion process.

### Questions
- Open or closed source?
- How consistent can we expect to be on say linters, formatting, etc?
- What level of customization do we want? For example, custom prop values in like dimensions or something?
