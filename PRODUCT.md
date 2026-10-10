# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individual developers who install and run Hagicode Server on their own machine. They move between first-run setup, daily service start and stop, version switching, dependency repair, diagnostics, and maintenance, and they choose which AI agent executor (Claude Code, Codex, GitHub Copilot CLI) the server uses. They also watch for official recommendations and update notices without wanting them to interrupt primary workflows.

## Product Purpose

Hagicode Desktop packages the Hagicode runtime into a local-first control console that keeps essential operational work in one place. Success means users can understand current service health at a glance, take the next maintenance action without hunting across screens, and stay aware of recommended updates or messages without losing focus on primary workflows.

## Positioning

Desktop does two things at once that running the server by hand does not: it manages the runtime for the user (bundled .NET runtime, install, version switching, dependency checks, tray access, so no terminal is needed for upkeep), and it is the single control surface for service health, packages, and agent executor selection. Zero-setup runtime management and the unified control and agent hub are equally core.

## Operating Context

Electron app on Windows (portable, MSIX, Store, Steam mode), macOS (x64 and arm64), and Linux (AppImage, zip). It runs alongside a local Hagicode Server and is used in short, frequent sessions: check status, start or stop, switch version, repair a dependency, glance at recommendations. Node/npm for CLI package management and auxiliary services is external to Desktop; only the managed .NET runtime ships with it.

## Capabilities and Constraints

- First-run onboarding and daily startup; start, stop, restart, and switch Hagicode Server versions.
- Dashboard for local resources, server status, and service health.
- Package sources, dependency management (required packages are marked; selected packages combine into a copyable batch install command), license information, and runtime updates.
- Agent executor selection (Claude Code, Codex, GitHub Copilot CLI).
- RSS-based recommendations and messages; system tray integration for quick background access.
- Downloads are direct only; the torrent-based path has been removed.
- Privileged OS access goes through the preload bridge; all user-facing strings go through the hagi18n flow.
- Locale set is ten languages: en-US, zh-CN, zh-Hant, de-DE, es-ES, fr-FR, ja-JP, ko-KR, pt-BR, ru-RU. READMEs describe English and Simplified Chinese only; that is a documentation gap, not a scope limit.

## Brand Commitments

Professional, agile, and clear. The interface should feel competent and focused rather than theatrical, a reliable operations companion that stays out of the way until action is needed. It must not feel like a marketing website, and it must not trade readability, status clarity, or operational efficiency for visual novelty.

## Evidence on Hand

Real product surface and copy live in `src/renderer/` with locale files under `src/renderer/i18n/`. Documentation is in `README.md`, `README_cn.md`, and `docs/`. No testimonials, usage metrics, or customer case studies are on hand; do not fabricate them.

## Product Principles

1. Put operational state first: service health, active version, logs, and next actions are visible before secondary content.
2. Keep primary actions next to the status they affect, so users can start, stop, repair, or inspect without context switching.
3. Make setup disappear: Desktop should manage the runtime so users spend their time on the server, not on its prerequisites.
4. Treat recommendations and messages as supportive context, never the center of attention.
5. Serve expert flow in every configured locale, with strong keyboard focus and restrained motion.

## Accessibility & Inclusion

Support the Desktop app's configured 10-language locale set. Maintain visible keyboard focus states across interactive controls, support reduced-motion preferences by minimizing decorative animation, and keep normal text at WCAG AA contrast or better in both light and dark themes.
