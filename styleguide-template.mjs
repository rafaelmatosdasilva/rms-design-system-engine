// styleguide-template.mjs - the style guide's template, read whole from its parts.
//
// The engine's template (templates/styleguide.template.html) is the page's frame: its head, the system's styles slot,
// the data and the scripts, with one line where each part goes. The parts are files of their own under
// templates/styleguide/ (css/ for the page's own styles, js/ for its script), each one area of the page, in the order
// they join: a change is reviewed and tested one area at a time, and the page they make is the same, byte for byte.
//
//   /*@part styleguide/css/02-reset.css*/     a part of the page's styles (a line of its own)
//   //@part styleguide/js/05-overview.js      a part of its script (a line of its own)
//
//   joinTemplate(text, dir) → the template with each part's line replaced by the part (paths from dir; one that leaves
//                             dir, or is not there, is left as written, so the page says what is missing)
//   readTemplate(file)      → the template file, whole
//   templateText()          → the engine's own template, whole
// A project's own template (styleguide.template) may be one file or use parts the same way.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'templates', 'styleguide.template.html');
export const PART = /^[ \t]*(?:\/\*@part ([\w./-]+)\*\/|\/\/@part ([\w./-]+))[ \t]*(?:\n|$)/gm;

export function joinTemplate(text, dir) {
  return String(text).replace(PART, (line, css, js) => {
    const file = resolve(dir, css ?? js), rel = relative(dir, file);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !existsSync(file)) return line;
    return readFileSync(file, 'utf8');
  });
}
export const readTemplate = (file) => joinTemplate(readFileSync(file, 'utf8'), dirname(file));
export const templateText = () => readTemplate(ENGINE_TEMPLATE);
