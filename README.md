# The maintenance engine for AI-ready design systems

Unlike standalone skills and fragmented workflows, RMS Design System Engine generates and connects design intent, implementation insights, documentation, contracts, verification and prototypes through shared knowledge. Every capability builds on the same context, allowing insights from one task to inform others without duplicating analysis or starting from scratch. This helps teams maintain reliable design systems as products evolve and AI agents build with them.

## Who it's for

- **Design-led teams** working in Figma who want to turn their design system into working code, build prototypes with real components and verify accessibility.
- **Design and engineering teams** who need to maintain parity between Figma and code, verify implementations against design intent and catch inconsistencies as designs and code evolve.
- **Code-first teams** who want to improve the reliability, accessibility and maintainability of their codebase, document components, track design system health and ensure AI-generated code follows their implementation rules.

## What it does

- **Understand**: Turn real design and code sources into structured design intent, component contracts, documentation and style guides that people and AI agents can use.
- **Verify**: Run deterministic checks for design-code parity, component usage, accessibility and implementation rules, with actionable findings rather than relying on AI judgement alone.
- **Maintain**: Detect inconsistencies and regressions as tokens, components, requirements and implementations change, keeping products aligned with the design system over time.

## Get started

**Requirements:** [Claude Code](https://claude.com/claude-code), [Node.js](https://nodejs.org) 22+ and [Git](https://git-scm.com).

Ask Claude Code to run this command to install the engine:

```bash
curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.sh | bash
```

Restart Claude Code and run:

```text
/rms-design-system-engine set up this project
```

Once configured, ask Claude Code to check parity, audit accessibility, generate a style guide, build prototypes or investigate component usage.

- `/rms-design-system-engine check everything`
- `/rms-design-system-engine check the button`
- `/rms-design-system-engine check the accessibility of the button`
- `/rms-design-system-engine build the style guide`
- `/rms-design-system-engine prototype a settings page with our components`

[See every command](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/commands.md), grouped by type.

## Explore

- [Features and capabilities](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md)
- [Technical documentation](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md)
- [Commands](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/commands.md)
- [Case study](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/CASE-STUDY.md)
- [Evaluation results](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/test/skill-evals/RESULTS.md)
- [Live style guide](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/)

## Open source

Built by [Rafael Matos da Silva](https://rafaelmatosdasilva.com). Released under the MIT License.
