# Web Service Startup Lifecycle Optimization

## Overview

Optimize the Web service startup and lifecycle management in the Hagicode Desktop application to improve reliability, user experience, and resource management. This change addresses critical issues with process lifecycle binding, port conflict detection, configuration synchronization, and user feedback during service startup.

## Background

The current Web service management implementation in `PCodeWebServiceManager` has the following characteristics:

- **Linux Platform**: Uses `start.sh` script, which is a blocking script that runs until service stops
- **Process Management**: Basic async startup with health checks implemented but incomplete lifecycle binding
- **Configuration Storage**: Service URL configuration stored in installation directory's `Config/appsettings.yml`
- **Current Gaps**:
  - Process lifecycle not fully bound to desktop application lifecycle
  - Port conflict detection only happens during service startup, not at app initialization
  - Configuration file synchronization is missing
  - User lacks clear feedback during startup process

## Problem Statement

### 1. Process Lifecycle Management Incomplete
**Current Behavior**: The `start.sh` script runs as a child process but is not fully bound to the desktop application lifecycle.

**Impact**:
- When the application exits abnormally, child processes may become orphaned
- Resource cleanup is not guaranteed
- Inconsistent behavior across platforms (Windows uses detached processes)

**Evidence**: `web-service-manager.ts:86-101` - `getSpawnOptions()` sets `detached: true` only for Windows

### 2. Port Conflict Detection Timing
**Current Behavior**: Port availability is only checked when starting the service (`web-service-manager.ts:195-200`).

**Impact**:
- Users discover port conflicts only after attempting to start the service
- No early warning in the UI before user interaction
- Poor user experience when port is already in use

**Evidence**: `checkPortAvailable()` is called within `start()` method, not during app initialization

### 3. Configuration File Synchronization Missing
**Current Behavior**: The `Config/appsettings.yml` file in the installation directory contains the `Urls` configuration, but runtime updates don't sync back to this file.

**Impact**:
- Configuration inconsistency between file and runtime state
- Manual file edits may be overwritten
- Confusion when service restarts with different port than expected

**Evidence**: `updateConfig()` at `web-service-manager.ts:473-475` only updates in-memory config

### 4. Startup Wait Experience Issues
**Current Behavior**: While health checks are implemented, users lack clear feedback during the waiting period.

**Impact**:
- Users uncertain if startup is progressing
- No distinction between "waiting for port" vs "waiting for health check"
- Potential premature UI actions during startup

**Evidence**: `waitForHealthCheck()` at `web-service-manager.ts:237-250` has no UI feedback mechanism

## Solution

### 1. Background Process Lifecycle Binding

**Approach**:
- Ensure `start.sh` spawns with `detached: false` on Linux to maintain parent-child relationship
- Add application exit handler to call `cleanup()` method
- Implement proper process group management for Unix systems

**Implementation Points**:
- Modify `getSpawnOptions()` to handle Linux platform consistently
- Add `before-quit` event handler in `main.ts` to call `webServiceManager.cleanup()`
- Ensure process cleanup handles both normal and abnormal exits

### 2. Startup Port Conflict Detection

**Approach**:
- Perform port availability check during application initialization
- Store port status in Redux state for UI access
- Display port status warning in Web Service card before user attempts to start

**Implementation Points**:
- Add IPC handler for port status check
- Call port check during app initialization in `main.ts`
- Extend Redux store to include port availability state
- Update `WebServiceStatusCard` component to show port warnings

### 3. Configuration File Synchronization & Port Persistence

**Approach**:
- Implement `syncConfigToFile()` method to read/write `appsettings.yml`
- Call sync method when configuration is updated
- Parse and modify YAML file preserving format and comments
- **Persist last successfully used port for automatic recovery**
- Load saved port configuration on application startup
- **Establish unified config directory at `userData/config/` for better maintainability**

**Implementation Points**:
- Use existing `js-yaml` library (already a dependency)
- Read `Config/appsettings.yml` from platform-specific installation path
- Update `Urls` field when port configuration changes
- Add error handling for file I/O operations
- **Store all desktop application configs in `userData/config/` directory**
- **Port persistence config: `userData/config/web-service.json`**
- **On startup, attempt to use saved port first, fallback to default if unavailable**
- **Unified config location enables easier backup, migration, and multi-service support**

### 4. Enhanced Status Feedback

**Approach**:
- Leverage existing `ProcessStatus` type with `'starting'` state
- Add port listening detection phase before health check
- Emit granular status updates to renderer process

**Implementation Points**:
- Break startup into phases: `port_check` → `spawning` → `waiting_listening` → `health_check` → `running`
- Send phase updates via IPC to renderer
- Display phase-specific messages in UI

## Impact

### Component Impact

| Component | Type | Changes |
|-----------|------|---------|
| `PCodeWebServiceManager` | Enhancement | Lifecycle binding, config sync, pre-check, phase tracking |
| `main.ts` | New Hook | Add `before-quit` event handler, initialization port check |
| `WebServiceStatusCard` | UI Enhancement | Port warning display, phase-based status feedback |
| Redux Store | State Extension | Add port availability field, startup phase field |

### User Experience Benefits

- ✅ **Improved Reliability** - No orphan processes, guaranteed resource cleanup
- ✅ **Early Error Detection** - Port conflicts discovered before user interaction
- ✅ **Configuration Consistency** - File and runtime config always synchronized
- ✅ **Transparent Progress** - Clear feedback during startup phases
- ✅ **Automatic Port Recovery** - Remembers last successful port, reduces manual configuration

### Technical Impact

- ✅ **Backward Compatible** - No breaking changes to existing APIs
- ✅ **Cross-Platform Consistency** - Unified lifecycle management across Linux/Windows/macOS
- ✅ **Testable Components** - Port check and config sync independently testable
- 🟡 **File I/O Risk** - Config file operations require robust error handling

### Risk Assessment

- 🟡 **Medium Risk** - Involves process management and file system operations
- 🟡 **Testing Required** - Need to test abnormal exit scenarios and file permissions
- 🟢 **Incremental Implementation** - Can be delivered in phases
- 🟢 **Rollback Safe** - Changes don't affect core service logic

## Non-Goals

This change explicitly **does not**:

- Modify existing health check logic (`performHealthCheck`)
- Change core service start/stop/restart flow
- Implement dynamic port allocation (fixed ports only)
- Handle multiple Web service instances
- Modify tray icon behavior or system integration
- Change installation or upgrade process

## Success Criteria

1. **Process Cleanup**: Child processes terminate when parent application exits (normal or abnormal)
2. **Port Pre-Check**: Application displays port availability warning at startup if port is in use
3. **Config Sync**: Changes to port configuration reflect in `appsettings.yml` within 100ms
4. **Status Clarity**: UI shows distinct phases during startup (checking → starting → listening → healthy)
5. **Platform Consistency**: All three platforms (Linux, Windows, macOS) exhibit consistent lifecycle behavior
6. **Port Persistence**: Application automatically loads and uses the last successfully configured port on startup

## Dependencies

### Internal Dependencies
- `electron-log` - Already used for logging
- `js-yaml` - Already used for version reading, will reuse for config sync
- Existing Redux store structure - Will extend, not replace

### External Dependencies
- None (uses existing Electron and Node.js APIs)

## Timeline Estimate

- **Phase 1** (Process Lifecycle): 2-3 hours
- **Phase 2** (Port Pre-Check): 2-3 hours
- **Phase 3** (Config Sync & Port Persistence): 5-7 hours (increased for port persistence)
- **Phase 4** (Status Feedback): 2-3 hours
- **Testing & Validation**: 3-4 hours

**Total**: 14-20 hours

## References

- Current Implementation: `src/main/web-service-manager.ts:1-492`
- Main Process: `src/main/main.ts:397-399` (existing `before-quit` handler)
- Package Manager Config: `src/main/package-manager.ts` (for config path reference)
