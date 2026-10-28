# The maintenance engine for AI-ready design systems

<p align="center">
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/actions/workflows/tests.yml"><img src="https://github.com/rafaelmatosdasilva/rms-design-system-engine/actions/workflows/tests.yml/badge.svg" alt="Tests"></a>
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20·%20Figma-a259ff?logo=figma&logoColor=white" alt="Works with Claude Code and Figma">
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022-339933?logo=nodedotjs&logoColor=white" alt="Node 22 or newer">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/commits/main"><img src="https://img.shields.io/github/last-commit/rafaelmatosdasilva/rms-design-system-engine/main?label=last%20commit" alt="Last commit"></a>
</p>

AI agents can build interfaces in minutes. The hard part is making sure what they build follows your design system, and keeps following it as tokens, components and requirements change.

RMS Design System Engine reads what you have (a Figma file, a codebase, or both) and turns it into documentation and component contracts that people and agents can use. It then checks every implementation against explicit rules, many of them measured in a real browser, instead of trusting the agent to get it right. Every check builds on the same shared knowledge, so what one task learns, the next one uses.

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

**Recommended:** [Google Chrome](https://google.com/chrome), so everything can be measured as a browser draws it, and TypeScript 5 (`npm i -g typescript@5`), so your components' JSX and props are read. Without them those checks are skipped; the installer tells you which are missing.

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
