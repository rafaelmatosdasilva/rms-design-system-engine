# rms-design-system-engine

**Your design system, kept true in code, for your whole team and the AI tools they use.**

It works inside Claude Code. It keeps your code matching your Figma design, and gives your team a [living style guide](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/), prototypes made of your real components and accessibility checks.

## What you get

- **High quality.** Every colour, size, font, shadow, state and animation in your code is checked against Figma, in every combination of modes (Dark on a phone, say), with the fix in plain words, and a border or a background Figma does not draw is found; a spinner's turn and a panel or a modal opening and closing too. Each product's page is laid out as its Figma screen, a product that builds a component by hand where its Figma screen uses the real one is found, a near copy of a component comes back to you as a decision, every value written by hand is counted with the token to use (and the count only falls), and anything the check could not look at is said, never shown as passed. Every check is tested with a mistake planted on purpose.
- **Change without breaking products.** A token renamed in Figma is renamed everywhere in one change, and what the system retires comes with every place still using it and what to write instead.
- **A living style guide** ([see one it built](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/)). One page with every token and component, built from your system, never written by hand, its durations and easings played as they move. Try each component, see its specs and every variant and how it stands with Figma and accessibility, read one list of tasks, everything still open, by component, see where what the team has written about each component is thin, and follow the system's health, one weighted number for parity, accessibility, documentation and motion, its AI readiness, the components with the most left, where the differences with Figma come from, the WCAG criteria most components fail, and how much of each component was really checked. Every component's accessibility is tried in a browser while the page is built, so it opens with the final results.
- **Prototypes from your real system.** Describe a screen in your own words and get it made only of your components, sized as your products' screens size them, following your guidelines and Do and Don't, with every state and screen size checked, pages you can click through, a design review before you see it, and working as your product does. What your system lacks is marked on the page and listed for your design team, with what was tried and why nothing fit.
- **Accessibility tested.** Each component is tried in a real browser against WCAG 2.2 at level A and AA, with axe-core's rules in the same run, in every state and colour mode, and so is each of your products' own pages, the Tab key followed through the whole page. The screens designed in Figma are measured too, for contrast and target size, and each problem is pinned on its layer in Figma. Every problem comes with its fix. Nothing else to run.
- **Build from Figma.** Only have the design? Claude builds it in code, piece by piece, each piece checked.
- **You stay in control.** Nothing in your design or code changes unless you ask.

## Learn more

- **[Everything it does](docs/features.md)**, in plain words.
- **[Technical details](docs/details.md)**, for developers.
- **[Case study](CASE-STUDY.md)** and **[every measurement](test/skill-evals/RESULTS.md)**, how it was tested against Claude alone.

## Why not just Claude with your code?

Claude on its own guesses and cannot tell when it got something wrong. The engine gives it the exact facts from Figma and your code, then checks everything it makes.

| | Claude alone | Claude with the engine |
|---|---|---|
| Builds a design system from Figma | 8 of 18 pieces right | 18 of 18 |
| Makes prototypes from your components | 17 of 36 right | 36 of 36 |
| Knows when the code stops matching Figma | No | Yes, with the fix |
| Tries accessibility in a browser | No | Always |

Measured with Claude Opus. The [case study](CASE-STUDY.md) has every model and the full story.

## How it works

1. **It reads your Figma file**, its tokens, components, props and notes.
2. **It compares your code with it**, value by value and in a real browser, with the fix for each difference.
3. **It shares one truth with everyone**, the style guide, one list of tasks, prototypes made of your components, and the facts your AI tools read.

The whole flow, step by step, is on the [FigJam board](https://www.figma.com/board/W5UEjkrLv5t4fqsGPQWqk8/rms-design-system-engine-flow?node-id=0-1).

## Get started

You need [Claude Code](https://claude.com/claude-code), [Node.js](https://nodejs.org) 22 or newer and Git.

**1. Install it, once per computer.** Copy this, paste it in Claude Code and press Enter. Say yes when Claude asks to run the install, then close Claude Code and open it again.

```
Install the rms-design-system-engine skill for me by running curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.sh | bash and tell me when it is done.
```

**2. Connect your project, once per project.** It asks where your code is and for your Figma link (optional), and finds the rest on its own. The code can be a folder, a git link, or a GitLab project link (gitlab.com or your company's GitLab), read straight from GitLab on every run so it always checks the latest commit; a private project needs a `GITLAB_TOKEN` in a `.env` where you run it ([how](docs/details.md#run-it)).

```
/rms-design-system-engine set up this project
```

**3. Ask in your own words.**

```
/rms-design-system-engine check everything
/rms-design-system-engine build the style guide
/rms-design-system-engine publish the style guide for the team
/rms-design-system-engine check the modal and show it in the style guide
/rms-design-system-engine prototype a settings page with our components
/rms-design-system-engine check the accessibility of the button
/rms-design-system-engine where is the panel used?
```

It updates itself once a day, so you never install it again.

## License

[MIT](LICENSE) © Rafael Matos da Silva. Free to use, change and share. Just keep the copyright line.
