# RMS Design System Engine

**The maintenance engine for AI-ready design systems.**

It connects design intent, implementation and automated verification, giving teams a dependable way to maintain their design system as both people and AI agents build products.

## Understand the system

Generate contracts, documentation, style guides and structured design intent from real sources.

## Verify the system

Check parity, component usage, accessibility and implementation changes against explicit rules.

## Maintain the system

Keep products aligned as tokens, components, requirements and implementations evolve.

## Explore

- [Features and capabilities](docs/features.md)
- [Technical documentation](docs/details.md)
- [Case study](CASE-STUDY.md) and [evaluation results](test/skill-evals/RESULTS.md)
- [Live style guide](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/)

## Get started

**Requirements:** [Claude Code](https://claude.com/claude-code), [Node.js](https://nodejs.org) 22+ and [Git](https://git-scm.com).

Install the engine:

```
curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.sh | bash
```

Restart Claude Code and run:

```
/rms-design-system-engine set up this project
```

Once configured, ask Claude Code to check parity, audit accessibility, generate a style guide, build prototypes or investigate component usage.

See the [technical documentation](docs/details.md#run-it) for setup details and the [features guide](docs/features.md) for available capabilities.

## Open source

Built by [Rafael Matos da Silva](https://rafaelmatosdasilva.com). Released under the [MIT License](LICENSE).
