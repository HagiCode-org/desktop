---
name: Hagicode Desktop
description: Local-first control console for running and maintaining Hagicode services.
colors:
  accent-blue: "#3563E9"
  accent-blue-strong: "#2449B8"
  accent-blue-soft: "#E6EDFF"
  neutral-bg: "#F5F7FB"
  neutral-surface: "#FBFCFE"
  neutral-surface-alt: "#EEF2F8"
  neutral-border: "#D9E0EC"
  neutral-text: "#162033"
  neutral-text-muted: "#66748E"
  dark-bg: "#0F1525"
  dark-surface: "#161E31"
  dark-surface-alt: "#1C2740"
  dark-border: "#2A3550"
  dark-text: "#EEF2FB"
typography:
  headline:
    fontFamily: "\"Microsoft YaHei UI\", \"Microsoft YaHei\", \"PingFang SC\", \"Noto Sans CJK SC\", system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "\"Microsoft YaHei UI\", \"Microsoft YaHei\", \"PingFang SC\", \"Noto Sans CJK SC\", system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "\"Microsoft YaHei UI\", \"Microsoft YaHei\", \"PingFang SC\", \"Noto Sans CJK SC\", system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "\"Microsoft YaHei UI\", \"Microsoft YaHei\", \"PingFang SC\", \"Noto Sans CJK SC\", system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  shell-panel:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.lg}"
    padding: "24px"
  button-primary:
    backgroundColor: "{colors.accent-blue}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-blue-strong}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.neutral-surface-alt}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  nav-item-active:
    backgroundColor: "{colors.accent-blue-soft}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: Hagicode Desktop

## 1. Overview

**Creative North Star: "The Local Operations Console"**

Hagicode Desktop should feel like a reliable desktop control room, not a showcase page. The visual system is built for ongoing service management work: status first, action second, supporting context third. Panels should read as tools for operation and maintenance, with enough warmth to feel modern but never so much decoration that the user questions where to click next.

The system is deliberately calm. It rejects marketing-page hero treatments, oversized gradients, glass-heavy surfaces, and neon glow effects. Information hierarchy comes from layout, spacing, and consistent component language rather than spectacle.

**Key Characteristics:**
- Clear operational hierarchy with service controls near service state
- Restrained blue accent used mainly for primary action and current selection
- Calm dense panels that support scanning, not dramatic reveal
- Strong keyboard and contrast affordances in both light and dark themes
- Supporting content, such as recommendations or feed items, presented as secondary utility

## 2. Colors

The palette is restrained and task-oriented: cool neutrals with one confident blue accent that signals action, selection, and trusted system state.

### Primary
- **Control Blue** (`#3563E9`): Use for the primary action, current navigation selection, selected status emphasis, and links that advance a core workflow.
- **Control Blue Deep** (`#2449B8`): Use for hover and pressed states on primary actions.

### Secondary
- **Soft Selection Blue** (`#E6EDFF`): Use as a low-pressure selected background for active navigation, quiet badges, and informational emphasis without introducing glow.

### Neutral
- **Console Mist** (`#F5F7FB`): Default light theme background.
- **Work Surface** (`#FBFCFE`): Primary panel and card surface.
- **Panel Wash** (`#EEF2F8`): Alternate light surface for grouped controls and secondary containers.
- **Quiet Border** (`#D9E0EC`): Borders, dividers, and control outlines.
- **Ink** (`#162033`): Primary text and high-priority labels.
- **Support Text** (`#66748E`): Secondary descriptions, helper text, and metadata.
- **Night Console** (`#0F1525`): Dark theme background.
- **Night Surface** (`#161E31`): Dark theme primary panel surface.
- **Night Surface Raised** (`#1C2740`): Dark theme alternate surface.
- **Night Border** (`#2A3550`): Dark theme outline and separator color.
- **Night Ink** (`#EEF2FB`): Dark theme primary text.

### Named Rules
**The One-Accent Rule.** Blue is the only assertive accent on routine product screens. If a surface feels like it needs more color to work, the layout is probably under-resolved.

## 3. Typography

**Display Font:** Microsoft YaHei UI / PingFang SC / Noto Sans CJK SC / system sans stack  
**Body Font:** Microsoft YaHei UI / PingFang SC / Noto Sans CJK SC / system sans stack  
**Label/Mono Font:** JetBrains Mono Variable for URLs, ports, and diagnostics only

**Character:** Typography should feel native to a desktop utility. Use one sans family for most UI hierarchy, then reserve mono for technical values that benefit from fixed character width.

### Hierarchy
- **Display** (600, 1.875rem, 1.2): Use sparingly for the dashboard page title or major empty states.
- **Headline** (600, 1.125rem, 1.35): Use for panel titles and major grouped areas.
- **Title** (600, 1rem, 1.35): Use for sub-panels, list item headings, and summary cards.
- **Body** (400, 0.9375rem, 1.6): Default reading size for descriptions and operational guidance. Keep prose blocks within roughly 65-75ch.
- **Label** (600, 0.75rem, 1.2, 0.02em): Use for metadata, eyebrow text, compact labels, and control grouping.

### Named Rules
**The Native Utility Rule.** Prefer familiar, readable system-adjacent typography over expressive type pairings. This is a tool surface, so trust matters more than typographic performance.

## 4. Elevation

Elevation is subtle and structural. Hagicode Desktop should read as layered panels with light separation, not as floating glass cards. Most surfaces stay flat at rest, using borders and slight tonal shifts to show grouping. Shadows are reserved for shell framing and interactive lift, especially in light theme.

### Shadow Vocabulary
- **Shell Frame** (`0 10px 30px rgba(22, 32, 51, 0.06)`): Use for the outer shell and major page panels.
- **Interactive Lift** (`0 4px 12px rgba(22, 32, 51, 0.08)`): Use on hoverable cards and button hover only when it clarifies clickability.
- **Dark Surface Lift** (`0 12px 28px rgba(8, 12, 24, 0.28)`): Use on dark theme shell surfaces that need separation from the page background.

### Named Rules
**The Flat-by-Default Rule.** If a panel can read clearly with border and tone alone, do not add a shadow.

## 5. Components

Each component should feel competent and compact, with obvious state changes and predictable spacing.

### Buttons
- **Shape:** Rounded rectangle (`12px`)
- **Primary:** Solid Control Blue with light text, medium weight, and compact desktop padding (`10px 16px`)
- **Hover / Focus:** Hover darkens the fill slightly. Focus uses a visible ring, never glow haze.
- **Secondary / Ghost:** Secondary buttons sit on Panel Wash or outlined surfaces. Ghost buttons are only for low-priority inline actions.

### Cards / Containers
- **Corner Style:** `16px` for major panels, `12px` for nested grouped regions
- **Background:** Work Surface or Night Surface for primary panels, Panel Wash or Night Surface Raised for grouped subsections
- **Shadow Strategy:** Shell Frame only on major panels, otherwise border-led structure
- **Border:** Quiet Border or Night Border at all times
- **Internal Padding:** `24px` on primary panels, `16px` on grouped sections, `12px` on compact summaries

### Inputs / Fields
- **Style:** Clear border, solid surface, medium corner radius (`12px`)
- **Focus:** Ring + border contrast, with no decorative bloom
- **Error / Disabled:** Errors use a direct destructive border and text treatment. Disabled fields retain contrast and stay readable.

### Navigation
- **Style:** Left sidebar with compact rows, small icon plus label, quiet hover background, and a low-pressure selected state using Soft Selection Blue instead of a high-contrast glow.
- **States:** Hover lightens the row background. Active state increases text emphasis and uses a subtle selected container.
- **Collapsed mode:** Preserve icon recognizability, tooltips, and keyboard focus without changing the control vocabulary.

### Feed / Recommendation Panels
- **Style:** Secondary utility panels should look editorially lighter than the service-control panel.
- **Priority:** Titles and timestamps come first, descriptions stay short, and external actions remain clearly secondary.

## 6. Do's and Don'ts

### Do:
- **Do** keep service state, lifecycle controls, active version, and log access within the first screenful on the dashboard.
- **Do** use blue only for priority actions, current selection, and positive service-ready emphasis.
- **Do** pair every interactive control with visible hover, focus, disabled, and loading states.
- **Do** use structured panel rhythm, 16px-24px spacing, and consistent 12px-16px corner radii across product surfaces.
- **Do** reserve motion for status change and feedback, not decoration.

### Don't:
- **Don't** make the app feel like a marketing website with hero-style composition or campaign visuals.
- **Don't** use large-area glassmorphism, neon glow, or ambient blur as a default product surface treatment.
- **Don't** sacrifice readability, keyboard flow, or operational efficiency for "tech" styling.
- **Don't** rely on repeated gradients, shimmer, or pulsing ornaments to communicate importance.
- **Don't** hide key maintenance actions behind secondary navigation when the related status is already on screen.
