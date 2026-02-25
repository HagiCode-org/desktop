# HagiCode Desktop - Agent Configuration

## Root Configuration
Inherits all behavior from `/AGENTS.md` at monorepo root.

## Project Context

HagiCode Desktop is an Electron desktop client for Hagicode Server management and monitoring. It provides a user-friendly interface for:
- System resource and service management
- Web service control (start, stop, restart)
- Version management (install, switch multiple versions)
- Dependency management (auto-detection and installation)
- Package source management (GitHub releases, HTTP indices, local folders)
- License management
- RSS feed monitoring for updates

## Platform Support

HagiCode Desktop supports multiple platform and architecture combinations:

| Platform | Architecture | Platform Identifier |
|----------|-------------|---------------------|
| Linux | x64 | `linux-x64` |
| Linux | ARM64 | `linux-arm64` |
| Windows | x64 | `win-x64` |
| macOS | x64 | `osx-x64` |
| macOS | ARM64 (Apple Silicon) | `osx-arm64` |

### Platform Detection

The application automatically detects the current platform using `process.platform` and `process.arch`. Platform-specific packages are filtered and installed based on this detection.

### Package Naming Convention

HagiCode packages follow the naming convention: `hagicode-{version}-{platform}-nort.zip`

Example: `hagicode-0.1.0-linux-arm64-nort.zip`

### Breaking Change Notice

**Previous identifier `darwin-arm64` has been renamed to `osx-arm64`** for consistency with the package naming convention used by hagibuild.

Any code directly referencing `darwin-arm64` should be updated to use `osx-arm64`.

## Tech Stack

### Core Framework
- **Electron**: 39.2.7
- **Node.js**: Compatible with npm 10.9.2
- **TypeScript**: 5.7.3 (strict mode enabled)

### Frontend
- **React**: 19.0.0
- **React DOM**: 19.0.0
- **Redux Toolkit**: 2.5.0 (state management)
- **React Redux**: 9.2.0
- **React Router DOM**: 7.11.0

### Build Tools
- **Vite**: 6.0.7 (bundler for renderer process)
- **electron-builder**: 26.0.12 (packaging)

### Styling
- **Tailwind CSS**: 4.0.0
- **Radix UI**: Multiple components (@radix-ui/react-*)
- **Base UI**: @base-ui/react 1.0.0
- **shadcn**: 3.6.2

### Internationalization
- **i18next**: 25.7.3
- **react-i18next**: 16.5.1

### Additional Libraries
- **axios**: 1.13.2 (HTTP client)
- **electron-store**: 10.0.0 (persistent storage)
- **electron-updater**: 6.6.2 (auto-updates)
- **electron-log**: 5.4.3 (logging)
- **@microsoft/applicationinsights-react-js**: 19.3.8 (telemetry)
- **rss-parser**: 3.13.0 (RSS feed parsing)
- **semver**: 7.7.3 (version comparison)

## Project Structure

```
src/
├── main/           # Electron main process code
│   ├── main.ts              # Entry point
│   ├── config-manager.ts    # Configuration management
│   ├── dependency-manager.ts
│   ├── license-manager.ts
│   ├── onboarding-manager.ts
│   ├── package-source-config-manager.ts
│   ├── rss-feed-manager.ts
│   ├── state-manager.ts
│   ├── tray.ts
│   └── package-sources/     # Package source implementations
├── preload/        # Electron preload scripts
└── renderer/       # React frontend code
    ├── App.tsx              # Root component
    ├── main.tsx             # Entry point
    ├── components/          # React components
    ├── store/               # Redux store
    │   ├── index.ts
    │   ├── listenerMiddleware.ts
    │   ├── slices/          # Redux slices
    │   └── thunks/          # Redux thunks
    ├── hooks/               # Custom React hooks
    ├── i18n/                # Internationalization
    └── lib/                 # Utility libraries
```

## Agent Behavior

When working in the hagicode-desktop submodule:

1. **Respect Electron architecture**: Understand the separation between main process, renderer process, and preload scripts
2. **Follow Redux Toolkit patterns**: Use slices and thunks for state management
3. **Use shadcn/Radix UI components**: Prefer these over building custom components
4. **Support i18n**: All user-facing strings must use i18next translation keys
5. **Path aliases**: Use `@/*` for imports within renderer process
6. **Type safety**: Strict TypeScript is enabled - maintain type safety

### Development Workflow
```bash
cd repos/hagicode-desktop
npm run dev              # Full development (renderer + main + preload + electron)
npm run dev:renderer     # Renderer dev server only
npm run dev:main         # Main process TypeScript watch
npm run build:prod       # Production build with smoke test
npm run build:win        # Windows build
npm run build:mac        # macOS build
npm run build:linux      # Linux build
```

## Specific Conventions

### Component Organization
- Co-locate components with their tests when applicable
- Use PascalCase for component files
- Follow shadcn patterns for component composition

### State Management
- Use Redux Toolkit slices for domain state
- Use listener middleware for side effects
- Keep thunks for async operations

### Import Paths
- Renderer process: Use `@/*` alias (resolves to `src/renderer/*`)
- Types: Import from `@types` alias for shared types
- Assets: Import from `@assets` alias

### Styling
- Use Tailwind utility classes
- Follow Tailwind CSS 4 patterns
- Use cn() utility for conditional classes (clsx + tailwind-merge)

## Disabled Capabilities

AI assistants should NOT suggest:
- Server-side Orleans patterns (this is a client-side desktop app)
- Backend-only technologies (Express, Fastify, etc.)
- Next.js patterns (this is an Electron app, not a web app)
- Database solutions directly in the desktop app (data is managed via Hagicode Server)
- CSS-in-JS libraries (use Tailwind CSS instead)

## References

- **Root AGENTS.md**: `/AGENTS.md` at monorepo root
- **Monorepo CLAUDE.md**: See root directory for monorepo-wide conventions
- **OpenSpec Workflow**: Proposal-driven development happens at monorepo root level (`/openspec/`)
- **Documentation**: See `repos/hagicode-desktop/docs/` for detailed guides
- **README**: `repos/hagicode-desktop/README.md`
