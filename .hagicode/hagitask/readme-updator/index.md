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

## Audience and focus

- Address developers and users who set up, run and manage HagiCode Server from the Hagicode Desktop app.
- Describe the value of the app first: first-run setup, daily startup, service checks, version updates, package management and agent selection.

## Required content

- Keep the product overview, core capabilities and related guides sections; keep development instructions short and link to `docs/development.md`.
- Show the AGPL-3.0 license badge only while `LICENSE` and `package.json` still agree.

## README languages

- Maintain English in `README.md` and Simplified Chinese in `README_cn.md`, keeping the reciprocal language link and the existing filenames.
- Keep both files aligned in scope and meaning.

## Exclusions

- Exclude signing certificates and passwords, telemetry keys, tokens, internal hosts, machine-specific paths and private links.
- Do not list capabilities the app does not show.
