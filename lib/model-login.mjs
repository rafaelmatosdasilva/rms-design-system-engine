// model-login.mjs - the login a run of the model's command uses, when the command cannot find one itself.
//
// Everything that asks a model runs `claude -p` (page-judgment.mjs, prototype-judgment.mjs, shell-judgment.mjs,
// guidance-rating.mjs). That command finds its own login on a person's machine, and on macOS that login lives in
// the keychain. A run that has no keychain to read - a fresh HOME, a hook, a job nobody is sitting at - finds
// none, and answers "Not logged in · Please run /login" with an exit code and nothing on stderr.
//
// The evaluation harness already solved this: `claude setup-token` prints a long-lived token, kept in a file
// beside the engine's other credentials, and read into CLAUDE_CODE_OAUTH_TOKEN for the run. That reading lived in
// the harness, so evaluations had a login and everything else did not - the same command, the same machine, one
// of them able to ask a model and the other not.
//
// It lives here now, and the harness reads it from here, so there is one copy. Nothing is written, nothing is
// asked for, and nothing is used that a person did not put there: a machine with no such file is left exactly as
// it was, for `claude` to find its own login as it always does.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// An API key wins where there is one, because a run on a key must never be billed to a person's plan.
export const KEY_FILE = join(homedir(), '.config', 'rms-engine', 'anthropic-key');
export const TOKEN_FILE = join(homedir(), '.config', 'rms-engine', 'oauth-token');

const firstLine = (file, skipComments = false) => {
  try {
    return readFileSync(file, 'utf8').split('\n').map((l) => l.trim())
      .find((l) => l && (!skipComments || !l.startsWith('#'))) ?? '';
  } catch { return ''; }   // no file: whatever login the run already has
};

export function withKeyFile(env, file = env.DESIGN_SYSTEM_ENGINE_EVAL_KEY_FILE || KEY_FILE) {
  if (env.ANTHROPIC_API_KEY) return env;
  const key = firstLine(file);
  return key ? { ...env, ANTHROPIC_API_KEY: key } : env;
}

export function withTokenFile(env, file = env.DESIGN_SYSTEM_ENGINE_EVAL_TOKEN_FILE || TOKEN_FILE) {
  if (env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN) return env;
  const token = firstLine(file, true);
  return token ? { ...env, CLAUDE_CODE_OAUTH_TOKEN: token } : env;
}

// Both, in the order the evaluation harness prefers them: a key wins there, because a measured run on a key must
// never be billed to a person's plan.
export const withCredentials = (env = process.env) => withTokenFile(withKeyFile(env));

// What the engine's own model calls use: the plan's login only, never a key. A person running --judge is spending
// their own plan, which is what the line they are shown says they are spending; a key file on the machine belongs
// to whoever measures the engine, and reaching for it would bill the wrong account and say nothing about it.
export const planLogin = (env = process.env) => withTokenFile(env);
