# From fragmented tools to shared design system intelligence

<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#publish-a-living-style-guide"><img src="https://raw.githubusercontent.com/rafaelmatosdasilva/rafaelmatosdasilva/main/assets/engine-status-sidebar.png" width="49%" alt="The style guide the engine builds, its Status page: parity with Figma, code, documentation and accessibility, scored for every component" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#publish-a-living-style-guide"><img src="https://raw.githubusercontent.com/rafaelmatosdasilva/rafaelmatosdasilva/main/assets/engine-identity-sidebar.png" width="49%" alt="The style guide the engine builds, its Identity page: the system's type, brand colour, neutral scale and semantic colours" /></a>

<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/actions/workflows/tests.yml"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/badges/tests.json&style=flat" /></a> <a href="https://scorecard.dev/viewer/?uri=github.com/rafaelmatosdasilva/rms-design-system-engine"><img src="https://img.shields.io/ossf-scorecard/github.com/rafaelmatosdasilva/rms-design-system-engine?label=OpenSSF%20Scorecard&style=flat" /></a> <a href="https://www.bestpractices.dev/projects/16082"><img src="https://img.shields.io/cii/level/16082?label=OpenSSF%20Best%20Practices&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/security.md#security-and-data"><img src="https://img.shields.io/badge/Local--first-0B81B6?logo=homeassistant&logoColor=white&style=flat" /></a>
<a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine#get-started"><img src="https://img.shields.io/badge/Claude%20Code-A95D44?logo=anthropic&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/CLI-3D851D?logo=gnubash&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/API-C7542B?logo=postman&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#works-with-your-tools"><img src="https://img.shields.io/badge/MCP-A95D44?logo=anthropic&logoColor=white&style=flat" /></a> <a href="https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/accessibility.md#accessibility-never-gets-worse"><img src="https://img.shields.io/badge/CI-196AC7?logo=githubactions&logoColor=white&style=flat" /></a>

Teams often rely on separate tools and AI skills to check Figma, validate code and write documentation. These tools overlap, duplicate work and rarely share what they learn, leaving gaps that AI agents fill with guesses. RMS Design System Engine brings everything together in one engine and shared knowledge layer, connecting Figma, code, documentation and decisions so every finding makes the next check, spec and screen more reliable.

---

# Features

Built on the tools you already use.
See what is ready at work in the [live style guide](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/), which the engine automatically builds.<br>

<sub>🟢 Ready to use &nbsp;&nbsp; 🟡 Early development &nbsp;&nbsp; ⚪ Coming soon</sub>

| Audit | |
|:---|:---:|
| <p></p>**[Check your Figma library rules](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#check-your-figma-library-rules)**<br>The patterns, architecture and rules your Figma library is built on, with a score for how well you follow them.<p></p><img src="https://img.shields.io/badge/Figma-7E45C7?logo=figma&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Figma%20MCP-7E45C7?logo=figma&logoColor=white&style=flat" /><p></p><sub></sub> | 🟢 |
| <p></p>**[Measure Figma-code parity](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#measure-figma-code-parity)**<br>A deep design-code comparison of colours, sizes, states and spacing in every mode, as a real browser draws them (25 gates).<p></p><img src="https://img.shields.io/badge/Figma-7E45C7?logo=figma&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Figma%20MCP-7E45C7?logo=figma&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Chrome-3368BE?logo=googlechrome&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Firefox-C7582C?logo=firefoxbrowser&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Safari-0054C7?logo=safari&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/React-066280?logo=react&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Vue.js-293949?logo=vuedotjs&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Tailwind%20CSS-058EA5?logo=tailwindcss&logoColor=white&style=flat" /><p></p><sub></sub> | 🟢 |
| <p></p>**[Lint your codebase rules](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#lint-your-codebase-rules)**<br>The patterns, architecture and rules your codebase is built on, with a score for how well you follow them.<p></p><img src="https://img.shields.io/badge/ESLint-3A2798?logo=eslint&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Stylelint-535964?logo=stylelint&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/TypeScript-265E9A?logo=typescript&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Sass-9F5077?logo=sass&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/GitHub-262626?logo=github&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/GitLab-C5551E?logo=gitlab&logoColor=white&style=flat" /><p></p><sub></sub> | 🟢 |
| <p></p>**[Test accessibility](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#test-accessibility)**<br>Contrast, keyboard focus, touch targets and zoom on every component, checked on the Figma designs and in a real browser.<p></p><img src="https://img.shields.io/badge/axe--core-502877?style=flat" /> <img src="https://img.shields.io/badge/WCAG%202.2%20A%20%2F%20AA-00467A?logo=w3c&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Chrome-3368BE?logo=googlechrome&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Firefox-C7582C?logo=firefoxbrowser&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Safari-0054C7?logo=safari&logoColor=white&style=flat" /><p></p><sub></sub> | 🟡 |

| Documentation | |
|:---|:---:|
| <p></p>**[Write component specs](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#write-component-specs)**<br>A contract per component with its props, states and tokens, written from Figma's descriptions and the code.<p></p><img src="https://img.shields.io/badge/DSDS-424242?style=flat" /> <img src="https://img.shields.io/badge/W3C%20DTCG-00467A?logo=w3c&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Code%20Connect-7E45C7?logo=figma&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/llms.txt-424242?style=flat" /><p></p><sub></sub> | 🟢 |
| <p></p>**[Gather usage guidelines](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#gather-usage-guidelines)**<br>The intent layer, why each component exists and when to use it, gathered from Figma, your code's comments and your docs.<p></p><img src="https://img.shields.io/badge/Figma-7E45C7?logo=figma&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Figma%20MCP-7E45C7?logo=figma&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/DSDS-424242?style=flat" /> <img src="https://img.shields.io/badge/GitLab-C5551E?logo=gitlab&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Markdown-535964?logo=markdown&logoColor=white&style=flat" /><p></p><sub></sub> | 🟢 |
| <p></p>**[Annotate Figma from the code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#annotate-figma-from-the-code)**<br>Accessibility specs written into Figma, problems pinned on your screens and each component linked to its code, after you approve.<p></p><sub></sub> | ⚪ |

| Collaboration | |
|:---|:---:|
| <p></p>**[Publish a living style guide](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#publish-a-living-style-guide)**<br>The team's control center, with Figma, the code, your docs, accessibility and decisions in one place, updated on every push.<p></p><img src="https://img.shields.io/badge/GitHub%20Pages-262626?logo=github&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/GitHub%20Actions-196AC7?logo=githubactions&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/GitLab-C5551E?logo=gitlab&logoColor=white&style=flat" /><p></p><sub></sub> | 🟢 |
| <p></p>**[Try components in a playground](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#try-components-in-a-playground)**<br>A component's props changed live, in every state and theme, as the code draws it, for design review and QA.<p></p><img src="https://img.shields.io/badge/React-066280?logo=react&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Vue.js-293949?logo=vuedotjs&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Vite-4E54C7?logo=vite&logoColor=white&style=flat" /> <img src="https://img.shields.io/badge/Nuxt-00AC65?logo=nuxt&logoColor=white&style=flat" /><p></p><sub></sub> | 🟡 |

| Creation | |
|:---|:---:|
| <p></p>**[Design themes over your system](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#design-themes-over-your-system)**<br>A new theme of your system's tokens, its colours, type, corners and spacing, set live in light and dark.<p></p><sub></sub> | ⚪ |
| <p></p>**[Turn Figma into code](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#turn-figma-into-code)**<br>A Figma-only system turned into code, piece by piece, with each one checked.<p></p><sub></sub> | ⚪ |
| <p></p>**[Turn code into Figma](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#turn-code-into-figma)**<br>Anything that exists only in your code, turned into Figma with its props as properties and its tokens as variables.<p></p><sub></sub> | ⚪ |
| <p></p>**[Generate in Figma from a prompt](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#generate-in-figma-from-a-prompt)**<br>Anything your system holds, a component, pattern, template or foundation, described by you and drawn in Figma from its rules.<p></p><sub></sub> | ⚪ |
| <p></p>**[Generate in code from a prompt](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#generate-in-code-from-a-prompt)**<br>Anything your system holds, a component, pattern, template or foundation, described by you and written in code from its rules.<p></p><sub></sub> | ⚪ |
| <p></p>**[Prototype with your real components](https://github.com/rafaelmatosdasilva/rms-design-system-engine/blob/main/docs/features.md#prototype-with-your-real-components)**<br>Prototypes built by AI from your real components, with nothing invented getting past the checks.<p></p><sub></sub> | ⚪ |

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
