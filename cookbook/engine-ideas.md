# An idea for the engine itself

**Use when.** the request is about the engine, not a design system: an idea or an article for it, a fault the engine has, or a change to its own code or guide.

## Steps

1. Run nothing on this folder's system, and no setup, even when this folder has no `ds-config.json`: the request is about the engine, and no audit or setup answers it.
2. Before calling an idea new, look for it in the engine: its modules (`lib/` in the install folder), its recipes and its reference, searched by what the idea does, not by the source's words. Say, for each part, whether it is built (name the module or command), partly built (say what is missing) or new.
3. An idea from outside (an article, a plugin, another skill or tool) is rebuilt in the engine's own model (Facts, Contracts, Intent, Evaluation), names and words: never the source's wording, names, lists, counts or order. Credit it generically.
4. Where it goes: someone who maintains the engine records it where the maintainers keep its planned work; anyone else opens an issue on the engine's public repository, in general terms (no product, client or person named).
5. A change to the engine's code or guide follows the maintainers' reference: the full suite before every push, and a guide change measured by the skill evaluation before it ships.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference maintainers`: *Nothing private, ever*, *Engine Evolution*, *Skill evaluation*

```recipe-check
rms-design-system-engine --reference maintainers
```
