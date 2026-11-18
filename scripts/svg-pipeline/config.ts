import type { Config } from 'svgo';

export type { Config };

/** GitHub blob links serve HTML, so point them at the raw file instead. */
export function normalizeConfigUrl(url: string, fallback: string): string {
  if (!url) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.hostname === 'github.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 5 && parts[2] === 'blob') {
      const [owner, repo, , branch, ...filePath] = parts;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath.join('/')}`;
    }
  }

  return url;
}

/**
 * SVGO configs are JS modules and there is no module loader here, so the module
 * is rewritten into a function body and evaluated.
 */
export function parseJsConfig(configText: string): Config {
  const exported: string[] = [];

  const source = configText
    .replace(/^[ \t]*import\b[^\n;]*;?[ \t]*$/gm, '')
    .replace(/\bexport\s+default\s+/g, '__default = ')
    .replace(
      /\bexport\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g,
      (_match, kind: string, name: string) => {
        exported.push(name);
        return `${kind} ${name}`;
      }
    )
    .replace(/\bexport\s*\{([^}]*)\}\s*;?/g, (_match, names: string) => {
      for (const entry of names.split(',')) {
        const local = entry.split(/\s+as\s+/)[0].trim();
        if (local) exported.push(local);
      }
      return '';
    });

  const declared: string[] = [];
  const declaration = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declaration)) declared.push(match[1]);

  const names = Array.from(
    new Set(['__default', ...exported, ...declared, 'module.exports'])
  );
  const collect = names
    .map((name) => `try { __add(${name}); } catch (error) {}`)
    .join('\n    ');

  const body = `
    let __default;
    const module = { exports: {} };
    const exports = module.exports;
    ${source}
    ;
    const __found = [];
    const __add = (value) => {
      if (value && typeof value === "object" && Object.keys(value).length > 0) {
        __found.push(value);
      }
    };
    ${collect}
    return __found.find((value) => Array.isArray(value.plugins)) ?? __found[0];
  `;

  const config = new Function(body)() as Config | undefined;
  if (!config) {
    throw new Error('The config file did not export an SVGO config.');
  }
  return config;
}

export async function loadConfig(
  url: string,
  fallback: string
): Promise<Config> {
  const finalUrl = normalizeConfigUrl(url, fallback);
  const response = await fetch(finalUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load config (${response.status})`);
  }

  if (finalUrl.endsWith('.json')) return (await response.json()) as Config;
  return parseJsConfig(await response.text());
}
