# Contributing

The way to take part is to **open an issue**. Tell us what broke, what you need, or where the documentation is wrong. Every issue is read and answered.

The engine is built by one maintainer, so pull requests are not accepted.

## Open an issue

[Open an issue](https://github.com/rafaelmatosdasilva/rms-design-system-engine/issues/new/choose) and pick the form that fits:

| Form | Use it when |
|---|---|
| **Something is broken** | The engine did something other than what it says it does. |
| **Ask for something** | You need a new feature, a check, a setting, or a change to how something works. |
| **The documentation is wrong** | A page says something the engine doesn't do, or has a typo or a broken link. |
| **An accessibility barrier** | Something the engine makes can't be used with a screen reader, the keyboard, zoom, high contrast or reduced motion. |

A few things that help:

- **One thing per issue.**
- **Look first.** It may already be asked, or on the [roadmap](ROADMAP.md).
- **Say what you were trying to do,** not only the feature you have in mind.
- **Keep it anonymous.** Replace any client, product, person or host name with an invented one.

Not an issue:

- **A question** about using it goes to [Discussions](https://github.com/rafaelmatosdasilva/rms-design-system-engine/discussions).
- **A security problem** goes through the Security tab, privately. [SECURITY.md](SECURITY.md) says how.

## What happens to your issue

**You get a first answer within a week.** Every issue gets a reply, a no included.

Each form asks **which part** of the [features page](docs/features.md) it is about. That part becomes a label (`part: Lint your codebase`).

Where an issue stands:

| Label | What it means |
|---|---|
| `needs triage` | New: not read yet. Every new issue starts here. |
| `needs info` | Waiting on you: the comment says what is missing. With no reply in 14 days it is closed, and your reply reopens it. |
| `confirmed` | Reproduced, or agreed it should change. Not planned yet. |
| `planned` | On the way. The change that fixes it closes it, so you are told when it lands. |
| `wontfix` | Declined. The comment always says why. |
| `duplicate` | Already asked. The comment links the issue that carries it on. |

How soon it is worked on:

| Label | When |
|---|---|
| `priority: high` | A problem found in use, or one that stops a part doing what the features page promises. An accessibility barrier in what the engine makes is always high. |
| `priority: medium` | It moves a part forward, or delivers what the features page already promises. |
| `priority: low` | Later. |

A fix reaches you the day after it is merged: every install updates itself once a day.

## Pull requests

Pull requests are not accepted, a typo fix included: open an issue instead, and it is fixed here. A pull request is closed with a link to this page. Nothing about it is personal.

## Forking

You are free to fork the engine under its [MIT license](LICENSE): change it, run your own version, build something else from it. Your fork is yours, and its changes stay there. [docs/development.md](docs/development.md) explains how the repository is laid out and tested.

## Code of conduct

Everyone in issues and discussions follows the [code of conduct](CODE_OF_CONDUCT.md): be respectful, and criticise ideas, not people.
