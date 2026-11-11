# The governance and reliability layer for AI-driven product development

<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/actions/workflows/tests.yml"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/badges/tests.json&style=flat" /></a> <a href="https://scorecard.dev/viewer/?uri=github.com/rafaelmatosdasilva/rms-design-system-engine"><img src="https://img.shields.io/ossf-scorecard/github.com/rafaelmatosdasilva/rms-design-system-engine?label=OpenSSF%20Scorecard&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/security.md#security-and-data"><img src="https://img.shields.io/badge/Local--first-555555?style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/package.json"><img src="https://img.shields.io/badge/Zero%20dependencies-555555?style=flat" /></a>
<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/Figma-A259FF?logo=figma&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/accessibility.md#accessibility-never-gets-worse"><img src="https://img.shields.io/badge/GitHub-313131?logo=github&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/setup.md#code-on-gitlab"><img src="https://img.shields.io/badge/GitLab-FC6D26?logo=gitlab&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#gather-usage-guidelines"><img src="https://img.shields.io/badge/Notion-313131?logo=notion&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#gather-usage-guidelines"><img src="https://img.shields.io/badge/Confluence-172B4D?logo=confluence&logoColor=white&style=flat" /></a>
<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/API-555555?style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/CLI-555555?style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/MCP-555555?style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/Code%20Connect-555555?style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/accessibility.md#accessibility-never-gets-worse"><img src="https://img.shields.io/badge/CI-555555?style=flat" /></a>
<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/audit.md#in-the-browser"><img src="https://img.shields.io/badge/Real%20browser-4285F4?logo=googlechrome&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/setup.md#what-the-engine-needs-on-your-machine"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#measure-figma-code-parity"><img src="https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#measure-figma-code-parity"><img src="https://img.shields.io/badge/Vue.js-4FC08D?logo=vuedotjs&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/audit.md#tailwind"><img src="https://img.shields.io/badge/Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=white&style=flat" /></a>
<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/reference/usage.md#the-standard-contract-layer-emitted-automatically-each-run"><img src="https://img.shields.io/badge/W3C%20DTCG-555555?logo=w3c&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/accessibility.md#test-accessibility"><img src="https://img.shields.io/badge/WCAG%202.2%20A%20%2F%20AA-555555?logo=w3c&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/accessibility.md#test-accessibility"><img src="https://img.shields.io/badge/axe--core-555555?style=flat" /></a>

AI agents can generate interfaces in minutes, but they don't inherently understand the design systems they're supposed to follow. Design decisions, component specifications and implementation rules are scattered across different tools and sources, leaving agents to make assumptions and repeat work. RMS Design System Engine brings this knowledge together, connecting every capability through a shared knowledge layer where findings from one workflow inform and strengthen the others.

---

# Features

See what is ready at work in the [live style guide](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/), which the engine automatically builds.<br>
<sub>🟢 Ready to use &nbsp;&nbsp; 🟡 Early development &nbsp;&nbsp; ⚪ Coming soon</sub>

| Audit | | |
|:---|---|:---:|
| [Check your Figma library rules](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#check-your-figma-library-rules) | The patterns, architecture and rules your Figma library is built on, with a score for how well you follow them. | 🟢 |
| [Measure Figma-code parity](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#measure-figma-code-parity) | A deep design-code comparison of colours, sizes, states and spacing in every mode, as a real browser draws them (25 gates). | 🟢 |
| [Test accessibility](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#test-accessibility) | Contrast, keyboard focus, touch targets and zoom on every component, checked on the Figma designs and in a real browser. | 🟡 |
| [Lint your codebase rules](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#lint-your-codebase-rules) | The patterns, architecture and rules your codebase is built on, with a score for how well you follow them. | ⚪ |

| Documentation | | |
|:---|---|:---:|
| [Write component specs](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#write-component-specs) | A contract per component with its props, states and tokens, written from Figma's descriptions and the code. | 🟢 |
| [Gather usage guidelines](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#gather-usage-guidelines) | The intent layer, why each component exists and when to use it, gathered from Figma, your code's comments and your docs. | 🟢 |
| [Annotate Figma from the code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#annotate-figma-from-the-code) | Accessibility specs written into Figma, problems pinned on your screens and each component linked to its code, after you approve. | ⚪ |

| Collaboration | | |
|:---|---|:---:|
| [Publish a living style guide](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#publish-a-living-style-guide) | The team's control center, with Figma, the code, your docs, accessibility and decisions in one place, updated on every push. | 🟢 |
| [Try components in a playground](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#try-components-in-a-playground) | A component's props changed live, in every state and theme, as the code draws it. | 🟡 |

| Creation | | |
|:---|---|:---:|
| [Design themes over your system](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#design-themes-over-your-system) | A new theme of your system's own tokens, its colours, type, corners and spacing set over a live screen in light and dark, each component's tokens a click away. | 🟡 |
| [Turn Figma into code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#turn-figma-into-code) | A Figma-only system turned into code, piece by piece, with each one checked. | ⚪ |
| [Turn code into Figma](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#turn-code-into-figma) | Anything that exists only in your code, turned into Figma with its props as properties and its tokens as variables. | ⚪ |
| [Generate in Figma from a prompt](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#generate-in-figma-from-a-prompt) | Anything your system holds, a component, pattern, template or foundation, described by you and drawn in Figma from its rules. | ⚪ |
| [Generate in code from a prompt](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#generate-in-code-from-a-prompt) | Anything your system holds, a component, pattern, template or foundation, described by you and written in code from its rules. | ⚪ |
| [Prototype with your real components](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#prototype-with-your-real-components) | Prototypes built by AI from your real components, with nothing invented getting past the checks. | ⚪ |
---

# Get started

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

Then ask in plain words, such as `/rms-design-system-engine check the button`. [See every command](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md).

---

# Who it's for

- **Design-led teams** working in Figma who want to review their library, document their design system and verify accessibility.
- **Design and engineering teams** who need to maintain parity between Figma and code, verify implementations against design intent and catch inconsistencies as designs and code evolve.
- **Code-first teams** who want to improve the reliability, accessibility and maintainability of their codebase, document components, track design system health and ensure AI-generated code follows their implementation rules.

---

# Explore

- [Features](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md)
- [Docs](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/README.md)
- [Security](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/security.md)
- [Studies](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/studies/README.md)
- [Governance](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/governance.md)

Built by [Rafael Matos da Silva](https://rafaelmatosdasilva.com). Released under the MIT License.
