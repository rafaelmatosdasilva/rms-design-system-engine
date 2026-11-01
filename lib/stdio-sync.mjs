// stdio-sync.mjs - what a run prints to a pipe is never lost when it exits.
// Node writes to a pipe asynchronously when the pipe is busy, and process.exit() drops what is still queued: a
// report read through a pipe (an agent's shell, CI, the audit reading a gate) could stop mid-line with nothing
// said. Blocking writes make every line reach the reader before the process ends. Imported first by the audit
// and passed to every gate it runs (--import).
for (const s of [process.stdout, process.stderr]) { try { s._handle?.setBlocking?.(true); } catch { /* not a pipe or a TTY: already synchronous */ } }
