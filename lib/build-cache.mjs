// build-cache.mjs - a part of the style guide's data kept between builds under what it was worked out from.
//
// A watch round builds the page twice (once for its audit to measure on, once after it), and most rounds change one
// thing: a part whose inputs are the same as last time gives the same, so it is taken from here instead of being
// worked out again. Only a part that reads nothing the audit writes is kept; its key is every input it reads.
//
//   partCache(ROOT) → { get(part, inputs), set(part, inputs, value) }: get answers undefined when the inputs differ
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR } from './names.mjs';

export const keyOf = (inputs) => createHash('sha256').update(JSON.stringify(inputs ?? null)).digest('hex').slice(0, 32);

export function partCache(ROOT) {
  const dir = join(ROOT, OUT_DIR, 'build-cache');
  const file = (part) => join(dir, `${String(part).replace(/[^\w-]/g, '-')}.json`);
  return {
    get(part, inputs) {
      try { const j = JSON.parse(readFileSync(file(part), 'utf8')); return j.key === keyOf(inputs) ? j.value : undefined; } catch { return undefined; }
    },
    set(part, inputs, value) {
      try { mkdirSync(dir, { recursive: true }); writeFileSync(file(part), JSON.stringify({ key: keyOf(inputs), value })); } catch { /* worked out again next time */ }
    },
  };
}
