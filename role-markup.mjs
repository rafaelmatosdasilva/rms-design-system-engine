// role-markup.mjs - what a Figma role annotation asks of a component's markup, read from its source without a browser.
//
// A component annotated "Role: togglebutton" in Figma must render a real button that carries aria-pressed; a styled
// <div> looks the same and does nothing for a keyboard or a screen reader. The browser check (a11y-check.mjs) sees this
// only on a rendered page; this reads the component's file, so `--component chip` catches it in any project.
// Only what the source shows for certain is reported: a component that renders the system's own component (<Button>)
// for its root may get the role from it, so it is left to the browser check.

// role word (as Figma's annotations write it, Specs' vocabulary included) → what the markup must hold
const NEEDS = {
  button: [{ test: /<button\b|role\s*=\s*["'{]?\s*["']?button\b/i, says: 'a <button> (or role="button")' }],
  iconbutton: [{ test: /<button\b|role\s*=\s*["'{]?\s*["']?button\b/i, says: 'a <button> (or role="button")' }],
  togglebutton: [
    { test: /<button\b|role\s*=\s*["'{]?\s*["']?button\b/i, says: 'a <button> (or role="button")' },
    { test: /aria-pressed/i, says: 'aria-pressed, written even when it is false' },
  ],
  textbox: [{ test: /<input\b(?![^>]*type\s*=\s*["'](?:checkbox|radio|button|submit|range)["'])|<textarea\b|role\s*=\s*["']textbox/i, says: 'an <input> or <textarea> (or role="textbox")' }],
  textinput: [{ test: /<input\b(?![^>]*type\s*=\s*["'](?:checkbox|radio|button|submit|range)["'])|<textarea\b|role\s*=\s*["']textbox/i, says: 'an <input> or <textarea>' }],
  checkbox: [{ test: /type\s*=\s*["']checkbox|role\s*=\s*["']checkbox/i, says: 'an <input type="checkbox"> (or role="checkbox")' }],
  radio: [{ test: /type\s*=\s*["']radio|role\s*=\s*["']radio/i, says: 'an <input type="radio"> (or role="radio")' }],
  switch: [
    { test: /role\s*=\s*["']switch/i, says: 'role="switch"' },
    { test: /aria-checked|type\s*=\s*["']checkbox/i, says: 'aria-checked (or a checkbox input)' },
  ],
  link: [{ test: /<a\b[^>]*\bhref|role\s*=\s*["']link/i, says: 'an <a href>' }],
};

// The role a component's Figma annotations declare, as written (lower case, no spaces): "togglebutton".
export function roleWord(annotations = []) {
  for (const a of annotations ?? []) {
    const m = /\brole\s*[:=]\s*["'“]?([a-z][\w -]*)/i.exec(String(a?.label ?? a?.labelMarkdown ?? ''));
    if (m) return m[1].trim().toLowerCase().replace(/[\s_-]+/g, '');
  }
  return null;
}

// What the source misses for the role → ['a <button> (or role="button")', …]; [] when it holds all, or when it cannot
// tell (an unknown role, or a root that is another component).
export function roleMarkupFindings(source, role) {
  const needs = NEEDS[String(role ?? '').toLowerCase().replace(/[\s_-]+/g, '')];
  if (!needs) return [];
  const text = String(source ?? '');
  const missing = needs.filter((n) => !n.test.test(text)).map((n) => n.says);
  if (!missing.length) return [];
  // Composition: the root is the system's own component (<Button …>) with no plain element the role could be on.
  const plain = /<(div|span|a|li|label|p|section)\b/i.test(text);
  if (!plain && /<[A-Z][\w.]*\b/.test(text.replace(/<(?:React\.)?Fragment\b/g, ''))) return [];
  return missing;
}
