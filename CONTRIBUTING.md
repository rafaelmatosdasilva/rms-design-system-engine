# Contributing

The engine has one maintainer. The way to take part is to **open an issue**: a problem you ran into, something you want it to do, a place the documentation is wrong. Every issue is read and answered.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). How decisions are made is in [GOVERNANCE.md](GOVERNANCE.md), and where the engine is going in [ROADMAP.md](ROADMAP.md).

## Report a problem or ask for something

[Open an issue.](https://github.com/rafaelmatosdasilva/rms-design-system-engine/issues/new/choose) The templates ask for what the answer depends on: what you ran, what you expected, what happened instead, and the run's output.

A security problem goes through the Security tab instead, never an issue. [SECURITY.md](SECURITY.md) says how, and what is worth reporting.

## What happens to your issue

**You get a first answer within a week.** Every issue is read, and every one gets a reply, a no included.

Each form asks **which part** of the [features page](docs/features.md) it is about. That part becomes a label (`part: Lint your codebase`), so issues are sorted by the same names you read there.

Where an issue stands is said by one label at a time:

| Label | What it means |
|---|---|
| `needs triage` | New: not read yet. Every new issue starts here. |
| `needs info` | Waiting on you: the comment says what is missing. With no reply in 14 days it is closed, and your reply reopens it. |
| `confirmed` | Reproduced, or agreed it should change. Not planned yet. |
| `planned` | On the way. The change that fixes it closes it, so you are told when it lands. |
| `wontfix` | Declined. The comment always says why. |
| `duplicate` | Already asked. The comment links the issue that carries it on. |

How soon it is worked on is its priority:

| Label | When |
|---|---|
| `priority: high` | A problem found in use, or one that stops a part doing what the features page promises. An accessibility barrier in what the engine makes is always high. |
| `priority: medium` | It moves a part forward, or delivers what the features page already promises. |
| `priority: low` | Later. |

A fix reaches you the day after it is merged: every install updates itself once a day.

## About pull requests

**Unsolicited pull requests are not merged.** Not because the work isn't welcome, but because a change to the engine carries a test, its documentation and a release label, and deciding whether a change belongs at all is the maintainer's job. A pull request that arrives before that decision is work spent on an answer that may be no.

So:

- **A typo, a broken link, a wrong command in the docs.** Just send it. These need no discussion.
- **Anything else.** Open an issue first. If the answer is yes, that is said in the issue, and a pull request is then welcome.

A pull request opened without that is closed with a pointer to this file. Nothing about it is personal.

## Forking

Forking is encouraged and the [MIT license](LICENSE) covers it. Take the engine, change it, run your own version, build something else from it. That is a different thing from sending the change back here, and only the second one is by invitation.

If you fork to work on the engine itself, [docs/development.md](docs/development.md) has the repository's layout, how to run the tests, and what a change has to satisfy.
