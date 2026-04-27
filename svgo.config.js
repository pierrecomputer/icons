const flattenGroups = {
  name: 'flattenGroups',
  fn: () => ({
    element: {
      exit: (node, parentNode) => {
        if (node.name !== 'g') return;
        const groupAttrs = node.attributes ?? {};
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
          convertTransform: false,
          inlineStyles: false,
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
