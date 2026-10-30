// property.js - fast-check for the property tests, and the values they generate.
//
// fast-check is a test tool, installed with TypeScript from test/.ci-tools' lockfile (npm ci --prefix test/.ci-tools),
// so the engine itself keeps no dependency. It is loaded from that folder by a plain require, since an import would not
// see it there. Without it, `fc` is null and the property tests skip, saying how to install it.
import { createRequire } from 'node:module';

const require = createRequire(new URL('./.ci-tools/package.json', import.meta.url));
let loaded = null;
try { loaded = require('fast-check'); } catch { /* not installed */ }

export const fc = loaded;
export const MISSING = loaded ? false : 'no fast-check (npm ci --prefix test/.ci-tools)';

// A colour channel, an alpha byte, and a hex colour written in any of the forms CSS takes.
export const byte = () => fc.integer({ min: 0, max: 255 });
const hex2 = (n) => n.toString(16).padStart(2, '0');
export const hexColor = () => fc.record({ r: byte(), g: byte(), b: byte(), a: fc.option(byte(), { nil: null }), upper: fc.boolean() })
  .map(({ r, g, b, a, upper }) => {
    const s = '#' + hex2(r) + hex2(g) + hex2(b) + (a == null ? '' : hex2(a));
    return { r, g, b, a, text: upper ? s.toUpperCase() : s };
  });

// A finite decimal as CSS writes it: no exponent, at most four decimals.
export const decimal = (min, max) => fc.integer({ min: min * 10000, max: max * 10000 }).map((n) => n / 10000);
export const css = (n) => String(+n.toFixed(4));
