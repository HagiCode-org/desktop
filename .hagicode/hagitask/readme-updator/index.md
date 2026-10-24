---
public: true
multilingual: true
languages:
  - en-US
  - zh-CN
sourceLanguage: en-US
style: product
---

# README requirements

## Product focus

- Introduce Hagicode Desktop as the desktop app that lets people set up, run and manage HagiCode Server without a terminal: guided first-run setup, start, stop, restart and version switching, a dashboard for local resources and service health, package and dependency management, runtime updates, agent executor selection (Claude Code, Codex, GitHub Copilot CLI) and tray access.
- Address developers and users who install and run HagiCode Server on their own machine.
- Lead with the value of the app first: first-run setup, daily startup, service checks, version updates, package management and agent selection.

## Required content

- Keep the product overview and core capabilities sections.
- Keep short links to the guides that help users and contributors, without copying their content.
- Show the AGPL-3.0 license badge only while `LICENSE` and `package.json` still agree.

## README languages

- Maintain English in `README.md` and Simplified Chinese in `README_cn.md`, keeping the reciprocal language link and the existing filenames.
- Keep both files aligned in scope and meaning.

## Exclusions

- Exclude signing certificates and passwords, telemetry keys, tokens, internal hosts, machine-specific paths and private links.
- Keep repository maintenance instructions out of the README: repository layout, internal architecture, CI, build and packaging commands, and contribution workflow.
- Do not list capabilities the app does not show.
