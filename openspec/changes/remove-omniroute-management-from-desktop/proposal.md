## Why

OmniRoute management functionality was integrated into the desktop client to provide process lifecycle control (PM2-based), configuration editing, log viewing, dependency repair, runtime verification, and status polling. The current stage no longer requires this management capability — it will be reconsidered for re-addition later. Leaving the code in place creates unnecessary maintenance burden, dead code paths, and compilation noise. A clean removal now reduces codebase complexity and avoids confusing developers with inactive features.

## What Changes

### Deletions (entire files/modules)

- **Main process core**: Remove `omniroute-manager.ts`, `omniroute-remediation.ts`, `omniroute-runtime.ts`, `omniroute-runtime-config-path.ts` — the entire OmniRoute management class, dependency repair logic, runtime configuration reader, and path resolver.
- **IPC handler**: Remove `ipc/handlers/omniRouteHandlers.ts` — all `omniroute:*` IPC channel handlers.
- **Type definitions**: Remove `types/omniroute-management.ts` — the OmniRoute management type contract.
- **Renderer page**: Remove `components/OmniRouteManagementPage.tsx` — the full management UI page.
- **Tests**: Remove `omniroute-manager.test.ts`, `omniroute-remediation.test.ts`, `omniroute-runtime.contract.test.ts`, `OmniRouteManagementPage.render.test.ts`, `dependencyManagementPageModel.omnirouteRepair.test.ts`, `viewThunks.omnirouteRepair.test.ts`, `omniroute-bridge.contract.test.ts`.

### Modifications (partial removals within existing files)

- **`main.ts`**: Remove OmniRouteManager instantiation, `startOmniRouteStatusPolling`, `omniRoutePollingInterval`, `initOmniRouteHandlers`/`registerOmniRouteHandlers` calls, `emitOmniRouteStatus`, and `'omniroute'` branch in `switch-view`.
- **`config.ts`**: Remove `omniroute` configuration field.
- **`desktop-runtime-paths.ts`**: Remove `'omniroute'` from `DesktopRuntimeComponentId` and `DesktopRuntimeServiceId` union types.
- **`dependency-manager.ts`**: Remove `'omniroute'` → `DependencyType.CliTool` mapping.
- **`ipc/handlers/index.ts`**: Remove OmniRoute handler re-export.
- **`ipc/handlers/dependencyManagementHandlers.ts`**: Remove all `runtimeId === 'omniroute'` branches and `requireOmniRouteManager` references.
- **`ipc/handlers/viewHandlers.ts`**: Remove `'omniroute'` from `switch-view` type.
- **`preload/index.ts`**: Remove `OmniRouteBridge` exposure.
- **`App.tsx`**: Remove `OmniRouteManagementPage` import and render condition.
- **`components/SidebarNavigation.tsx`**: Remove `{ id: 'omniroute', ... }` navigation item.
- **`store/slices/viewSlice.ts`**: Remove `'omniroute'` from `ViewType` union; clean `DependencyManagementRepairIntent` omniroute references.
- **`store/thunks/viewThunks.ts`**: Remove `openOmniRouteDependencyRepair` and related thunks.
- **`components/DependencyManagementPage.tsx`**: Remove omniroute references.
- **`components/WebServiceStatusCard.tsx`**: Remove omniroute readiness status references.
- **`components/ManagedServiceMiniCard.tsx`**: Remove omniroute managed card logic.
- **`components/SystemManagementView.tsx`**: Remove omniroute references if present.
- **`shared/vendored-runtimes.ts`**: Remove omniroute runtime references.
- **`types/dependency-management.ts`**: Remove omniroute type references.
- **i18n files** (all 12 locales × `common.json` + 2 locales × `components.json`): Remove `sidebar.omniroute` and all `omniroute.*` namespace translation keys (~39 keys total).
- **Other files with omniroute references** (~15+ additional source/test files): Clean up imports, type references, and conditional branches.
- **Scripts**: Evaluate and clean `scripts/` omniroute-related scripts (prepare, verify, contract, etc.) — these may be kept if they serve non-desktop purposes.

### Out of scope

- **`resources/omniroute/`** and **`build/desktop-runtime/.../omniroute/`**: These contain vendored OmniRoute runtime binaries/artifacts. They are not source code and should be noted but handled separately (build/packaging concern).
- **`desktop-omniroute-pm2-management`** and related OpenSpec specs at the mono level: These will remain as historical specs; archiving them is a separate concern.
- **Non-desktop omniroute capabilities** (Docker image bootstrap, web statusbar indicator, settings API in core): These are in other repos and unaffected.

## Capabilities

### New Capabilities

_None_ — This is a pure removal change.

### Modified Capabilities

- **desktop-omniroute-pm2-management**: All requirements are being removed. The desktop application will no longer manage OmniRoute processes, configuration, logs, or status. This spec becomes obsolete for the desktop client.

## Impact

### Code (hagicode-desktop)

| Layer | Files deleted | Files modified | Est. lines removed |
|-------|--------------|----------------|-------------------|
| Main process | 4 | ~10 | ~1,500 |
| IPC handlers | 1 | 3 | ~300 |
| Preload | 0 | 1 | ~20 |
| Types | 1 | 1 | ~100 |
| Renderer components | 1 | 5 | ~600 |
| Renderer store | 0 | 2 | ~80 |
| i18n (12 locales) | 0 | 14 | ~500 |
| Tests | 7 | ~8 | ~800 |
| Scripts | 0 | ~8 | ~200 |
| **Total** | **14** | **~52** | **~4,100** |

### APIs / IPC

- **BREAKING**: All `omniroute:*` IPC channels are removed. The preload bridge no longer exposes `OmniRouteBridge`.
- **BREAKING**: `ViewType` union loses `'omniroute'` member. Any external consumers switching on view type must handle its absence.

### Navigation / UX

- Sidebar no longer shows OmniRoute entry.
- Dependency management page no longer lists omniroute as a vendored runtime.

### Configuration

- `config.ts` no longer contains `omniroute` field. Existing user configs with this field will silently ignore it.

### Dependencies

- No npm dependency changes required. PM2 and other OmniRoute-related packages may remain if used by other features.

### Downstream

- No other repos are affected. The OmniRoute runtime binaries in `resources/` and `build/` are packaging concerns to be handled in a follow-up.
- Existing OpenSpec specs (`desktop-omniroute-pm2-management`, `omniroute-settings`, `omniroute-statusbar-indicator`) at the mono level should be archived but that is a separate administrative action.

### Recovery path

All removed code exists in version control history. The modular file structure (each concern in its own file) means the feature can be restored on a per-file basis when needed.
