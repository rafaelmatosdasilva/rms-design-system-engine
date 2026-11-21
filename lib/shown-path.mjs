// shown-path.mjs - a path as the engine says it: with forward slashes on every system.
//
// What the engine prints (a file a finding names, the patch it wrote, the next command) reads the same on Windows,
// macOS and Linux, so a person, an agent following a NEXT line and a test all read one form. Windows takes forward
// slashes in every path it is given, so a path said this way still opens there.
//
//   slashed(p) → p with each backslash a forward slash
export const slashed = (p) => String(p ?? '').replace(/\\/g, '/');
