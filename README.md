# ptt-term

[![Deploy to GitHub Pages](../../actions/workflows/deploy.yml/badge.svg?branch=dev)](../../actions/workflows/deploy.yml)
[![CodeQL](../../actions/workflows/dynamic/github-code-scanning/codeql/badge.svg)](../../actions/workflows/dynamic/github-code-scanning/codeql)
[![Dependabot Updates](../../actions/workflows/dynamic/dependabot/dependabot-updates/badge.svg)](../../actions/workflows/dynamic/dependabot/dependabot-updates)

An HTML5-based web client for connecting to ANSI terminal-based BBS sites.
This repository contains the source code running behind
[term.ptt.cc](https://term.ptt.cc/) and [term.ptt2.cc](https://term.ptt2.cc/).

## History

`ptt-term` is derived from [robertabcd/PttChrome](https://github.com/robertabcd/PttChrome),
which was originally forked from [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome).
`ptt-term` also incorporates many excellent patches from
[ccns/PttChrome](https://github.com/ccns/PttChrome/).

The original `PttChrome` was a Chrome browser extension. `robertabcd` added WebSocket support and
ported it to a standalone HTML5 web application independent of Chrome extension APIs.
That codebase served `term.ptt.cc` until 2026.

`ptt-term` is the official repository for `term.ptt.cc` and `term.ptt2.cc`.
It consolidates active patches from various PttChrome forks along
with its own enhancements and features.

## How to Contribute

Because [robertabcd/PttChrome](https://github.com/robertabcd/PttChrome) is no longer maintained,
we established `ptt-term` as an independent repository rather than a GitHub fork of
robertabcd's original project.

You are welcome to contribute to `ptt-term` by submitting Pull Requests:

1. **Direct Fork**: Click **Fork** on [ptt/ptt-term](https://github.com/ptt/ptt-term),
   push your changes to your fork, and submit a Pull Request to `dev`.
2. **Existing Fork**: If you already have an existing fork of another `PttChrome` repository,
   you can add `ptt-term` as a new git remote, cherry-pick your commits onto a branch tracking
   `ptt/ptt-term`, and submit a Pull Request:

```bash
# Example: Adding ptt-term as a remote to an existing local repo
git remote add ptt https://github.com/ptt/ptt-term.git
git fetch ptt
git checkout -b my-feature ptt/dev
git cherry-pick <your-commit-hash>
git push origin my-feature
```

## Local Development

```bash
# Install dependencies
yarn

# Start development server
yarn start

# Build for production
yarn build
```
