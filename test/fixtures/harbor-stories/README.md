Harbor's stories: what a team with Storybook keeps beside its components, laid over a copy of `harbor-ds` by
`test/storybook-real.test.mjs` and built with the Storybook pinned in `test/.storybook-tools`. Every name is invented.

Three of Button's stories are variants Figma has. Two are not, on purpose: Loading, a state Figma never draws, and
Huge, a size Figma does not list. The run names both.

Button's story file also says what the team wrote by hand (its description, each prop's description, options and
default) and Badge's is tagged beta, read into the contracts by `test/storybook-docs-real.test.mjs`. Three of those lines
disagree with the code on purpose: `tone`, a prop the button no longer has, `size`'s option Huge, and `label`'s default.

Two of Disclosure's stories carry a play function, the team's own script of a person using it: Opens, which passes,
and ClosesOnEscape, which fails on purpose, since the disclosure does not close on Escape. The run says the second as a
behaviour that breaks.
