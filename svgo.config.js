const flattenGroups = {
  name: 'flattenGroups',
  fn: () => ({
    element: {
      exit: (node, parentNode) => {
        if (node.name !== 'g') return;
        const groupAttrs = node.attributes ?? {};
        // Preserve translated groups emitted by the exporter. Flattening them
        // into their children makes a second SVGO pass change canonical SVGs.
        if (groupAttrs.transform != null) return;
        for (const child of node.children) {
          if (child.type !== 'element') continue;
          child.attributes ??= {};
          for (const [key, value] of Object.entries(groupAttrs)) {
            if (key === 'opacity' && child.attributes.opacity != null) {
              child.attributes.opacity = String(
                Number(child.attributes.opacity) * Number(value)
              );
            } else if (child.attributes[key] == null) {
              child.attributes[key] = value;
            }
          }
        }
        const idx = parentNode.children.indexOf(node);
        parentNode.children.splice(idx, 1, ...node.children);
      },
    },
  }),
};

export const SVGOConfig = {
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupNumericValues: false,
          collapseGroups: false,
          convertColors: false,
          convertPathData: false,
          convertTransform: false,
          inlineStyles: false,
          mergePaths: false,
          moveElemsAttrsToGroup: false,
          moveGroupAttrsToElems: false,
          removeUnknownsAndDefaults: false,
          sortAttrs: false,
        },
      },
    },
    // Keep viewBox
    'removeViewBox',
    // convert width/height to viewBox if missing
    { name: 'removeDimensions' },
    flattenGroups,
    {
      name: 'removeAttrs',
      params: {
        preserveCurrentColor: true,
        attrs: [
          'path:fill',
          'circle:fill',
          'rect:fill',
          'polygon:fill',
          'line:stroke',
        ],
      },
    },
  ],
};
