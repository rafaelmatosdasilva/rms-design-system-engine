# RMS Design System Engine

**The maintenance engine for AI-ready design systems.**

It connects design intent, implementation and automated verification, helping teams keep their design systems reliable as products evolve and AI agents generate more code.

### Understand the system

Turn real design and code sources into contracts, documentation, style guides and structured design intent that both people and AI agents can use.

### Verify the system

Check design-code parity, component usage, accessibility and implementation against explicit rules, with actionable findings instead of relying on AI judgement alone.

### Maintain the system

Track inconsistencies and regressions as tokens, components, requirements and implementations change, helping products stay aligned over time.

## Why it matters

AI can generate interfaces quickly, but speed alone doesn't guarantee consistency with your design system. RMS Design System Engine makes design-system requirements explicit and verifiable, combining structured design intent with deterministic checks to help teams catch issues that AI-generated code can introduce.

## Get started

**Requirements:** [Claude Code](https://claude.com/claude-code), [Node.js](https://nodejs.org) 22+ and [Git](https://git-scm.com).

Ask Claude Code to run this command to install the engine:

```
curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.sh | bash
```

Restart Claude Code and run:

```
/rms-design-system-engine set up this project
```

Once configured, ask Claude Code to check parity, audit accessibility, generate a style guide, build prototypes or investigate component usage.

- `/rms-design-system-engine check everything`
- `/rms-design-system-engine check the button`
- `/rms-design-system-engine check the accessibility of the button`
- `/rms-design-system-engine build the style guide`
- `/rms-design-system-engine prototype a settings page with our components`

## Explore

- [Features and capabilities](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md)
- [Technical documentation](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md)
- [Case study](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/CASE-STUDY.md)
- [Evaluation results](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/test/skill-evals/RESULTS.md)
- [Live style guide](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/)

## Open source

Built by [Rafael Matos da Silva](https://rafaelmatosdasilva.com). Released under the MIT License.

Add a clear project value propositionMake the installation flow more reassuring
