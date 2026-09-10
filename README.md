# ptt-term

An HTML5 web client for ANSI terminals via WebSocket, optimized for
Taiwanese BBSes.

This repository powers the official web client running at
**[term.ptt.cc](https://term.ptt.cc/)** and
**[term.ptt2.cc](https://term.ptt2.cc/)**.

## Features

- **Dual Rendering Engines**: High-performance HTML5 Canvas rendering alongside
  a DOM-based fallback.
- **Mobile & Touch Optimized**: Virtual keyboard, multi-touch pinch/pan
  navigation, and a native mobile IME input sheet.
- **Complete Big5 & Unicode Stack**: Native Unicode-at-on (UAO 2.50) decoding
  and accurate double-width CJK character handling.
- **Extensive Color Themes**: Built-in schemes (Classic Default, Monochrome,
  Solarized Dark, Nord, Monokai, Dracula, Amber/Green CRT) plus a customizable
  16-color ANSI palette.
- **Extensible Plugin System**: Modular plugins for mouse browsing, image
  preview, easy reading mode, and auto-login.
- **PWA Ready**: Installable Progressive Web App with standalone display
  support and responsive layout.
- **Modern Toolchain**: Built with Preact, Vite, and an automated Node.js test
  suite.

## History & Major Contributors

`ptt-term` represents the evolution of web-based terminal clients for Taiwanese
BBSes across more than a decade of open source community collaboration:

- **Chuck Yang ([iamchucky](https://github.com/iamchucky))**:
  Created the original `PttChrome` in 2012 as a Google Chrome browser extension,
  establishing the foundational ANSI terminal parsing and BBS navigation logic.
- **Robert Wang ([robertabcd](https://github.com/robertabcd))**:
  Added WebSocket connection support and ported `PttChrome` into a standalone
  HTML5 web application independent of Chrome extension APIs. This
  groundbreaking release powered the official `term.ptt.cc` service from 2015
  through 2026.
- **Wei-Cheng Yeh (IID, [IepIweidieng](https://github.com/IepIweidieng))**:
  Worked on `ccns/PttChrome` and made contributions including dynamic page
  title, a more efficient dual-color rendering approach, text blink (SGR 5)
  support, various fixes for mouse browsing and Big5 transcoding, plus
  continuous integration (CI/CD) and build configuration via GitHub.
- **Hung-Te Lin (piaip, [hungte](https://github.com/hungte))**:
  Focused on performance, standard and security. Created new features including
  high-performance HTML5 Canvas rendering engine, mobile and touch interface,
  modernized architecture with stylish look and feel, modular plugin framework,
  PWA support, and turned the application from "BBS tool" to a "generic ANSI
  terminal".

The repository under the **[PTT](https://github.com/ptt)** organization
([ptt/ptt-term](https://github.com/ptt/ptt-term)) is the official upstream
codebase powering **[term.ptt.cc](https://term.ptt.cc/)** and
**[term.ptt2.cc](https://term.ptt2.cc/)**.

## How to Contribute

Because [robertabcd/PttChrome](https://github.com/robertabcd/PttChrome) is no
longer maintained, we established `ptt-term` as an independent repository
rather than a GitHub fork of robertabcd's original project.

You are welcome to contribute to `ptt-term` by submitting Pull Requests:

1. **Direct Fork**: Click **Fork** on
   [ptt/ptt-term](https://github.com/ptt/ptt-term), push your changes to your
   fork, and submit a Pull Request to `dev`.
2. **Existing Fork**: If you already have an existing fork of another
   `PttChrome` repository, you can add `ptt-term` as a new git remote,
   cherry-pick your commits onto a branch tracking `ptt/ptt-term`, and submit a
   Pull Request:

```bash
# Example: Adding ptt-term as a remote to an existing local repo
git remote add ptt https://github.com/ptt/ptt-term.git
git fetch ptt
git checkout -b my-feature ptt/dev
git cherry-pick <your-commit-hash>
git push origin my-feature
```

## Reporting Bugs

The easiest and recommended way to report a bug is directly from within `ptt-term`:
1. Open **Settings** (right-click anywhere in the terminal or tap the toolbar menu ➜ **Settings**).
2. Switch to the **About** tab.
3. Click the **Bug Report** (問題回報) button next to the build info.

This will automatically open GitHub with your **Build Info** (commit hash and build date) and occurrence date pre-filled!

Alternatively, you can submit a report manually using the
[Bug Report template](https://github.com/ptt/ptt-term/issues/new?template=bug_report.yml).
When filing manually, please provide the **Build Info** from the **About** tab (or the commit hash and date you built from), as it is essential for reproducing and diagnosing issues.

## Local Development

```bash
# Install dependencies
yarn

# Start development server
yarn start

# Run unit tests
yarn test

# Build for production
yarn build
```

## License

This project is licensed under the terms of the GNU General Public License v2.
See [LICENSE](LICENSE) for details.
