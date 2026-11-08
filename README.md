# The governance and reliability layer for AI-driven product development

<p align="left">
	
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/actions/workflows/tests.yml"><img src="https://img.shields.io/github/actions/workflow/status/rafaelmatosdasilva/rms-design-system-engine/tests.yml?branch=main&label=2%2C000%2B%20tests&logo=github" alt="2,000+ tests, run on every change"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/rafaelmatosdasilva/rms-design-system-engine"><img src="https://img.shields.io/ossf-scorecard/github.com/rafaelmatosdasilva/rms-design-system-engine?label=OpenSSF%20security%20score" alt="OpenSSF security score"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#security-and-data"><img src="https://img.shields.io/badge/privacy-local--first-2b8a3e" alt="Privacy: local-first"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/dependencies-none-2b8a3e" alt="No npm dependencies"></a>
  <br>

  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/Figma-API%20%C2%B7%20CLI%20%C2%B7%20MCP%20%C2%B7%20Code Connect-A259FF?logo=figma&logoColor=white" alt="Figma through its API, figma-cli, Code Connect or MCP"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#accessibility-never-gets-worse"><img src="https://img.shields.io/badge/GitHub-CI%20%C2%B7%20docs-313131?logo=github&logoColor=white" alt="GitHub CI and docs"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#code-on-gitlab"><img src="https://img.shields.io/badge/GitLab-code%20%C2%B7%20CI%20%C2%B7%20docs-FC6D26?logo=gitlab&logoColor=white" alt="GitLab code, CI and docs"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#gather-usage-guidelines"><img src="https://img.shields.io/badge/Notion-docs%20source-313131?logo=notion&logoColor=white" alt="Notion as a docs source"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#gather-usage-guidelines"><img src="https://img.shields.io/badge/Confluence-docs%20source-172B4D?logo=confluence&logoColor=white" alt="Confluence as a docs source"></a>
  <br>

  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#in-the-browser"><img src="https://img.shields.io/badge/Chrome-measured in a real browser-4285F4?logo=googlechrome&logoColor=white" alt="Chrome measured in a real browser"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#what-the-engine-needs-on-your-machine"><img src="https://img.shields.io/badge/TypeScript-read-3178C6?logo=typescript&logoColor=white" alt="TypeScript read"></a>
	<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#compare-figma-and-code"><img src="https://img.shields.io/badge/React-supported-149ECA?logo=react&logoColor=white" alt="React supported"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#compare-figma-and-code"><img src="https://img.shields.io/badge/Vue.js-supported-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue.js supported"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#tailwind"><img src="https://img.shields.io/badge/Tailwind%20CSS-supported-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS supported"></a>
  <br>

  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/reference/usage.md#the-standard-contract-layer-emitted-automatically-each-run"><img src="https://img.shields.io/badge/W3C%20DTCG-design%20tokens-005A9C?logo=w3c&logoColor=white" alt="W3C DTCG design tokens"></a>
	<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#test-accessibility"><img src="https://img.shields.io/badge/WCAG-2.2%20A%20%C2%B7%20AA-005A9C?logo=w3c&logoColor=white" alt="WCAG 2.2 A and AA"></a>
  <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#test-accessibility"><img src="https://img.shields.io/badge/axe--core-accessibility-663399" alt="axe-core accessibility rules"></a>
  <br>
</p>

AI agents can generate interfaces in minutes, but they don't inherently understand the design systems they're supposed to follow. Design decisions, component specifications and implementation rules are scattered across different tools and sources, leaving agents to make assumptions and repeat work. RMS Design System Engine brings this knowledge together, connecting every capability through a shared knowledge layer where findings from one workflow inform and strengthen the others.

## Features

### Audit

| Feature | What it does | Status |
|---|---|---|
| [Check your Figma library](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#check-your-figma-library) | Finds missing tokens, detached instances, missing auto layout and components built differently from the rest. | Ready to use |
| [Lint your codebase](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#lint-your-codebase) | Finds tokens named by look, aliases to deleted tokens, hard-coded colours and copied components across your code, and stops a push that adds them. | Ready to use |
| [Compare Figma and code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#compare-figma-and-code) | A deep design-code parity check of colours, sizes, states and spacing in every mode, as a real browser draws them (25 gates). | Ready to use |
| [Test accessibility](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#test-accessibility) | Tests contrast, keyboard focus, touch targets and zoom on every component, in a real browser. | Early development |

### Documentation

| Feature | What it does | Status |
|---|---|---|
| [Write component specs](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#write-component-specs) | A contract per component with its props, states and tokens, written from Figma's descriptions and the code. | Ready to use |
| [Gather usage guidelines](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#gather-usage-guidelines) | The intent layer, which says why each component exists and when to use it, gathered from Figma's descriptions and notes and your docs. | Ready to use |
| [Annotate Figma from the code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#annotate-figma-from-the-code) | Writes accessibility specs, pins problems on your screens and links each component to its code, after you approve. | Coming soon |

### Collaboration

| Feature | What it does | Status |
|---|---|---|
| [Publish a living style guide](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#publish-a-living-style-guide) | The team's control center, with Figma, the code, your docs, accessibility and decisions in one place, updated on every push. | Ready to use |
| [Try components in a playground](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#try-components-in-a-playground) | Change a component's props live, in every state and theme, as the code draws it. | Early development |

### Creation

| Feature | What it does | Status |
|---|---|---|
| [Turn Figma into code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#turn-figma-into-code) | Turns a Figma-only system into code, piece by piece, checking each one. | Coming soon |
| [Bring code components into Figma](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#bring-code-components-into-figma) | Turns a component that exists only in your code into a Figma component, with its props and tokens, for designers to fine-tune. | Coming soon |
| [Generate components in Figma and code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#generate-components-in-figma-and-code) | Describe a component in plain words and get it built in Figma, code or both. | Coming soon |
| [Prototype with your real components](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#prototype-with-your-real-components) | AI builds prototypes with your real components, and nothing invented gets past the checks. | Coming soon |

See what is ready at work in the [live style guide](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/), which the engine builds from Figma and the code. Nothing on it is written by hand.

## Get started

You need [Claude Code](https://claude.com/claude-code), [Node.js](https://nodejs.org) 22+ and [Git](https://git-scm.com). [Google Chrome](https://google.com/chrome) and TypeScript 5 are recommended; the installer tells you if they are missing.

1. Ask Claude Code to install the engine:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.sh | bash
   ```

2. Restart Claude Code.
3. Set up your project:

   ```text
   /rms-design-system-engine set up this project
   ```

Then ask in plain words, such as `/rms-design-system-engine check the button`. [See every command](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/commands.md).

## Who it's for

- **Design-led teams** working in Figma who want to review their library, document their design system and verify accessibility.
- **Design and engineering teams** who need to maintain parity between Figma and code, verify implementations against design intent and catch inconsistencies as designs and code evolve.
- **Code-first teams** who want to improve the reliability, accessibility and maintainability of their codebase, document components, track design system health and ensure AI-generated code follows their implementation rules.

## Explore

- [Features and capabilities](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md)
- [How it works](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#how-it-works)
- [Technical documentation](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md)
- [Commands](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/commands.md)
- [Security and data](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/details.md#security-and-data) and the [assurance case](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/assurance-case.md)
- [Roadmap](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/ROADMAP.md) and [governance](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/GOVERNANCE.md)
- [Case study](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/CASE-STUDY.md)
- [Evaluation results](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/test/skill-evals/RESULTS.md)

Built by [Rafael Matos da Silva](https://rafaelmatosdasilva.com). Released under the MIT License.
