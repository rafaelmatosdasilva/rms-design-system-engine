// json-schema.mjs - a small JSON Schema (draft 2020-12) validator, for checking what the engine writes against a
// standard's own published schema (DSDS's bundled schema today), with no dependency.
//
//   validate(schema, data, { from }) → { valid, errors: [{ at, rule, message }], unknown }
//     from: start at one of the schema's own parts (an $id, with or without a #/pointer) instead of its root.
//
// It covers the keywords such a schema uses to say what a document must hold: type, const, enum, pattern, the
// object keywords (properties, patternProperties, additionalProperties, required, propertyNames, unevaluatedProperties),
// the array keywords (items, prefixItems, minItems, maxItems, uniqueItems, contains), the string and number bounds,
// allOf, anyOf, oneOf, not, if / then / else, dependentRequired, and $ref to any $id or JSON pointer in the same
// document. `format` and the annotations (description, example, default, $comment) are read as notes, never checked,
// as the specification itself leaves `format` to assert nothing by default. A keyword it does not know is named in
// `unknown`, so a schema that starts relying on one is noticed instead of passing quietly.
//
// unevaluatedProperties needs to know which properties the rest of the schema looked at, through every branch that
// matched: each step returns the names it evaluated, and only a branch that passed contributes them, as the
// specification says.
//
// Pure: no I/O.

const NOTES = new Set(['$schema', '$id', '$comment', '$defs', 'definitions', 'title', 'description', 'default', 'example', 'examples',
  'format', 'deprecated', 'readOnly', 'writeOnly', 'contentMediaType', 'contentEncoding', '$anchor', '$vocabulary']);
const KNOWN = new Set([...NOTES, '$ref', 'type', 'const', 'enum', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'properties', 'patternProperties', 'additionalProperties', 'required',
  'propertyNames', 'unevaluatedProperties', 'minProperties', 'maxProperties', 'dependentRequired', 'items', 'prefixItems',
  'minItems', 'maxItems', 'uniqueItems', 'contains', 'minContains', 'maxContains', 'allOf', 'anyOf', 'oneOf', 'not', 'if',
  'then', 'else']);

const typeOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const isType = (v, t) => t === 'number' ? typeof v === 'number' : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t;
const equal = (a, b) => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => equal(a[k], b[k]));
};
const ptr = (at, k) => `${at}/${String(k).replace(/~/g, '~0').replace(/\//g, '~1')}`;

// Every schema resource in the document by its absolute $id, so a $ref can reach any of them.
function indexIds(root) {
  const ids = new Map();
  const walk = (node, base) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) walk(n, base); return; }
    let here = base;
    if (typeof node.$id === 'string') { here = new URL(node.$id, base).href.replace(/#$/, ''); ids.set(here, node); }
    for (const [k, v] of Object.entries(node)) if (k !== 'const' && k !== 'enum' && k !== 'example' && k !== 'examples' && k !== 'default') walk(v, here);
  };
  const base = typeof root.$id === 'string' ? root.$id : 'urn:root';
  ids.set(base.replace(/#$/, ''), root);
  walk(root, base);
  return ids;
}

function resolvePointer(doc, pointer) {
  if (!pointer || pointer === '/') return doc;
  let node = doc;
  for (const raw of pointer.replace(/^\//, '').split('/')) {
    const k = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (node == null || typeof node !== 'object' || !(k in node)) return undefined;
    node = node[k];
  }
  return node;
}

export function validate(schema, data, { from = null } = {}) {
  const ids = indexIds(schema);
  const unknown = new Set();
  const regexes = new Map();
  const re = (p) => { if (!regexes.has(p)) regexes.set(p, new RegExp(p, 'u')); return regexes.get(p); };

  const resolve = (ref, base) => {
    const url = new URL(ref, base);
    const frag = decodeURIComponent(url.hash.replace(/^#/, ''));
    url.hash = '';
    const resource = ids.get(url.href);
    if (!resource) return null;
    const target = frag ? resolvePointer(resource, frag) : resource;
    return target === undefined ? null : { schema: target, base: url.href };
  };

  // → { errors, evaluated: Set of property names this schema looked at on an object }
  function check(s, v, at, base) {
    const errors = [];
    const evaluated = new Set();
    if (s === true) return { errors, evaluated };
    if (s === false) return { errors: [{ at, rule: 'false', message: 'nothing is allowed here' }], evaluated };
    if (!s || typeof s !== 'object') return { errors, evaluated };
    if (typeof s.$id === 'string') base = new URL(s.$id, base).href.replace(/#$/, '');
    const fail = (rule, message) => errors.push({ at: at || '/', rule, message });
    const sub = (schema2, v2, at2, collect = false) => {
      const r = check(schema2, v2, at2, base);
      if (collect && !r.errors.length) for (const k of r.evaluated) evaluated.add(k);
      return r;
    };
    for (const k of Object.keys(s)) if (!KNOWN.has(k)) unknown.add(k);

    if (s.$ref !== undefined) {
      const target = resolve(s.$ref, base);
      if (!target) fail('$ref', `the schema points at ${s.$ref}, which it does not hold`);
      else {
        const r = check(target.schema, v, at, target.base);
        errors.push(...r.errors);
        if (!r.errors.length) for (const k of r.evaluated) evaluated.add(k);
      }
    }
    if (s.type !== undefined) {
      const types = [].concat(s.type);
      if (!types.some((t) => isType(v, t))) fail('type', `is ${typeOf(v)}, where ${types.join(' or ')} is expected`);
    }
    if ('const' in s && !equal(v, s.const)) fail('const', `is ${JSON.stringify(v)}, where it must be ${JSON.stringify(s.const)}`);
    if (Array.isArray(s.enum) && !s.enum.some((e) => equal(e, v))) fail('enum', `is ${JSON.stringify(v)}, which is none of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}`);

    if (typeof v === 'string') {
      if (typeof s.pattern === 'string' && !re(s.pattern).test(v)) fail('pattern', `${JSON.stringify(v)} does not match ${s.pattern}`);
      const len = [...v].length;
      if (typeof s.minLength === 'number' && len < s.minLength) fail('minLength', `is shorter than ${s.minLength}`);
      if (typeof s.maxLength === 'number' && len > s.maxLength) fail('maxLength', `is longer than ${s.maxLength}`);
    }
    if (typeof v === 'number') {
      if (typeof s.minimum === 'number' && v < s.minimum) fail('minimum', `is below ${s.minimum}`);
      if (typeof s.maximum === 'number' && v > s.maximum) fail('maximum', `is above ${s.maximum}`);
      if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum) fail('exclusiveMinimum', `is not above ${s.exclusiveMinimum}`);
      if (typeof s.exclusiveMaximum === 'number' && v >= s.exclusiveMaximum) fail('exclusiveMaximum', `is not below ${s.exclusiveMaximum}`);
      if (typeof s.multipleOf === 'number' && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) fail('multipleOf', `is not a multiple of ${s.multipleOf}`);
    }

    if (typeOf(v) === 'object') {
      const keys = Object.keys(v);
      for (const r of s.required ?? []) if (!(r in v)) fail('required', `lacks ${r}`);
      if (typeof s.minProperties === 'number' && keys.length < s.minProperties) fail('minProperties', `has fewer than ${s.minProperties} fields`);
      if (typeof s.maxProperties === 'number' && keys.length > s.maxProperties) fail('maxProperties', `has more than ${s.maxProperties} fields`);
      for (const [k, need] of Object.entries(s.dependentRequired ?? {})) if (k in v) for (const n of need) if (!(n in v)) fail('dependentRequired', `has ${k} but lacks ${n}`);
      const matched = new Set();
      for (const [k, ps] of Object.entries(s.properties ?? {})) if (k in v) { matched.add(k); evaluated.add(k); errors.push(...sub(ps, v[k], ptr(at, k)).errors); }
      for (const [p, ps] of Object.entries(s.patternProperties ?? {})) for (const k of keys) if (re(p).test(k)) { matched.add(k); evaluated.add(k); errors.push(...sub(ps, v[k], ptr(at, k)).errors); }
      if (s.additionalProperties !== undefined) for (const k of keys) if (!matched.has(k)) {
        evaluated.add(k);
        if (s.additionalProperties === false) fail('additionalProperties', `holds ${k}, which is not allowed here`);
        else errors.push(...sub(s.additionalProperties, v[k], ptr(at, k)).errors);
      }
      if (s.propertyNames !== undefined) for (const k of keys) for (const e of sub(s.propertyNames, k, ptr(at, k)).errors) fail('propertyNames', `the name ${JSON.stringify(k)}: ${e.message}`);
    }

    if (Array.isArray(v)) {
      if (typeof s.minItems === 'number' && v.length < s.minItems) fail('minItems', `has ${v.length} item(s), fewer than ${s.minItems}`);
      if (typeof s.maxItems === 'number' && v.length > s.maxItems) fail('maxItems', `has more than ${s.maxItems} items`);
      if (s.uniqueItems === true) for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (equal(v[i], v[j])) fail('uniqueItems', `items ${i} and ${j} are the same`);
      const prefix = s.prefixItems ?? [];
      prefix.forEach((ps, i) => { if (i < v.length) errors.push(...sub(ps, v[i], ptr(at, i)).errors); });
      if (s.items !== undefined && !Array.isArray(s.items)) for (let i = prefix.length; i < v.length; i++) errors.push(...sub(s.items, v[i], ptr(at, i)).errors);
      if (s.contains !== undefined) {
        const n = v.filter((x, i) => !sub(s.contains, x, ptr(at, i)).errors.length).length;
        const min = s.minContains ?? 1;
        if (n < min) fail('contains', `holds ${n} matching item(s), fewer than ${min}`);
        if (typeof s.maxContains === 'number' && n > s.maxContains) fail('maxContains', `holds more than ${s.maxContains} matching items`);
      }
    }

    if (Array.isArray(s.allOf)) s.allOf.forEach((b) => errors.push(...sub(b, v, at, true).errors));
    if (Array.isArray(s.anyOf)) {
      const rs = s.anyOf.map((b) => sub(b, v, at, true));
      if (!rs.some((r) => !r.errors.length)) fail('anyOf', `matches none of its ${rs.length} allowed shapes (${closest(rs)})`);
    }
    if (Array.isArray(s.oneOf)) {
      const rs = s.oneOf.map((b) => check(b, v, at, base));
      const ok = rs.filter((r) => !r.errors.length);
      if (ok.length === 1) for (const k of ok[0].evaluated) evaluated.add(k);
      if (ok.length === 0) fail('oneOf', `matches none of its ${rs.length} allowed shapes (${closest(rs)})`);
      if (ok.length > 1) fail('oneOf', `matches ${ok.length} of its allowed shapes, where exactly one must`);
    }
    if (s.not !== undefined && !check(s.not, v, at, base).errors.length) fail('not', 'matches a shape it must not');
    if (s.if !== undefined) {
      const cond = check(s.if, v, at, base);
      if (!cond.errors.length) {
        for (const k of cond.evaluated) evaluated.add(k);
        if (s.then !== undefined) errors.push(...sub(s.then, v, at, true).errors);
      } else if (s.else !== undefined) errors.push(...sub(s.else, v, at, true).errors);
    }

    if (s.unevaluatedProperties !== undefined && typeOf(v) === 'object') for (const k of Object.keys(v)) if (!evaluated.has(k)) {
      if (s.unevaluatedProperties === false) fail('unevaluatedProperties', `holds ${k}, which this kind of object does not have`);
      else { const r = check(s.unevaluatedProperties, v[k], ptr(at, k), base); errors.push(...r.errors); }
      evaluated.add(k);
    }
    return { errors, evaluated };
  }

  // The branch that came closest, in a few words: what a person needs to fix the shape they meant.
  function closest(rs) {
    const best = [...rs].sort((a, b) => a.errors.length - b.errors.length)[0];
    const e = best?.errors?.[0];
    return e ? `nearest: ${e.at} ${e.message}` : 'no detail';
  }

  const base = typeof schema.$id === 'string' ? schema.$id.replace(/#$/, '') : 'urn:root';
  // `from` starts at one of the document's own schemas ($id or pointer) instead of its root.
  const { errors } = check(from ? { $ref: from } : schema, data, '', base);
  return { valid: errors.length === 0, errors, unknown: [...unknown] };
}
