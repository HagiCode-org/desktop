# Web Service Startup Lifecycle Optimization - Design Document

## Architecture Overview

This document details the architectural decisions and design considerations for optimizing the Web service startup lifecycle management in Hagico Desktop.

## Current Architecture Analysis

### Process Management Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Main Process                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         PCodeWebServiceManager                       │  │
│  │  ┌─────────┐  ┌────────────┐  ┌─────────────────┐   │  │
│  │  │ Config  │──│ Spawn      │──│ Health Check    │   │  │
│  │  │         │  │ Process    │  │                 │   │  │
│  │  └─────────┘  └────────────┘  └─────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ spawn()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Child Process (start.sh)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              PCode.Web (ASP.NET Core)                 │  │
│  │           HTTP Server on localhost:5000               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Current Issues in Architecture

1. **Lifecycle Disconnect**: Child process can outlive parent on abnormal exits
2. **Late Validation**: Port conflicts detected during spawn, not initialization
3. **Config Divergence**: Runtime config and file config not synchronized
4. **Opaque Startup**: Single "starting" state hides granular progress

## Design Decisions

### Decision 1: Process Lifecycle Binding

**Problem**: Child processes may become orphaned when parent exits abnormally.

**Options Considered**:

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| A. Use `detached: true` on all platforms | Process independence | Orphan risk high | ❌ Rejected |
| B. Use `detached: false` + process groups | Cleanup guaranteed | Platform-specific implementation | ✅ **Chosen** |
| C. Use PID tracking + kill at exit | Simple cross-platform | Race conditions possible | ❌ Rejected |

**Chosen Approach**: Option B with platform-specific implementation

**Rationale**:
- Ensures child processes terminate with parent
- Leverages OS process group mechanisms
- Maintains existing Windows behavior (already detached)
- Aligns with Unix process management best practices

**Implementation**:

```typescript
// Linux/macOS: Create new process group
options.detached = false;
options.stdio = 'ignore';

// In forceKill(), kill entire process group
process.kill(-pid, 'SIGKILL');

// Windows: Keep existing detached behavior
if (platform === 'win32') {
  options.detached = true;
  options.windowsHide = true;
}
```

**Trade-offs**:
- ✅ Guaranteed cleanup
- ✅ Platform-appropriate behavior
- 🟡 Increased complexity in `forceKill()` method
- 🟡 Requires testing on all three platforms

### Decision 2: Port Conflict Pre-Check

**Problem**: Port conflicts discovered too late in user journey.

**Options Considered**:

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| A. Check only on service start | Simple implementation | Poor UX | ❌ Current |
| B. Check at app initialization + expose to UI | Early discovery | Additional startup delay | ✅ **Chosen** |
| C. Background check + async update | No startup delay | Stale data possibility | ❌ Rejected |

**Chosen Approach**: Option B - Check at initialization

**Rationale**:
- Users see warnings before attempting to start service
- Check is fast (<100ms) so startup delay negligible
- Data is fresh at app startup
- Simple state management in Redux

**Implementation**:

```typescript
// In main.ts app.whenReady()
const portAvailable = await webServiceManager.checkPortAvailable();
mainWindow?.webContents.send('port-status-changed', {
  port: webServiceConfig.port,
  available: portAvailable
});
```

**Trade-offs**:
- ✅ Early error discovery
- ✅ Clear user feedback
- ✅ Minimal performance impact
- 🟡 One-time check (doesn't detect later port changes)

### Decision 3: Configuration File Synchronization & Port Persistence

**Problem**: Runtime config changes don't persist to `appsettings.yml`, and successful port configurations are lost between sessions.

**Options Considered**:

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| A. Don't sync (state in memory only) | Simple | Config inconsistency | ❌ Current |
| B. Sync on every config change + persist port | Always consistent, auto-recovery | File I/O overhead | ✅ **Chosen** |
| C. Batched sync with debounce | Reduced I/O | Complex state mgmt | ❌ Rejected |

**Chosen Approach**: Option B - Immediate sync with port persistence

**Rationale**:
- Config changes are infrequent (user-initiated)
- File I/O is fast enough for this use case
- Simpler state management
- No risk of lost changes
- **Improves UX by remembering successful configurations**
- **Reduces manual port reconfiguration on each start**

**Implementation**:

```typescript
// Enhanced config with port persistence
private async syncConfigToFile(): Promise<void> {
  const configPath = this.getConfigFilePath();
  const content = await fs.readFile(configPath, 'utf-8');
  const config = yaml.load(content);

  config.Urls = `http://${this.config.host}:${this.config.port}`;

  await fs.writeFile(configPath, yaml.dump(config), 'utf-8');

  // Persist to app config for next startup
  await this.saveLastSuccessfulPort(this.config.port);
}

public async updateConfig(config: Partial<WebServiceConfig>): Promise<void> {
  const oldPort = this.config.port;
  this.config = { ...this.config, ...config };

  if (config.port && config.port !== oldPort) {
    await this.syncConfigToFile();
  }
}

// New method to load saved port on startup
private async loadSavedPort(): Promise<number | null> {
  const configPath = path.join(this.userDataPath, 'config', 'web-service.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.lastSuccessfulPort || null;
  } catch {
    return null; // No saved config found
  }
}

// New method to save successful port
private async saveLastSuccessfulPort(port: number): Promise<void> {
  const configPath = path.join(this.userDataPath, 'config', 'web-service.json');
  const config = { lastSuccessfulPort: port, savedAt: Date.now() };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
```

**Config Directory Structure**:
```
userData/
├── config/                    # Unified config directory for all desktop configs
│   ├── web-service.json      # Web service port persistence
│   ├── package-manager.json  # Future: package manager config
│   └── ui-settings.json      # Future: UI preferences
├── pcode-web/
│   └── installed/
│       └── appsettings.yml   # PCode Web app config
└── logs/
```

**Trade-offs**:
- ✅ Always consistent
- ✅ Simple implementation
- ✅ Easy to test
- ✅ **Reduces user configuration friction**
- ✅ **Unified config directory enables easier migration and backup**
- ✅ **Clear separation: desktop configs vs installed app configs**
- 🟡 File I/O on every port change (acceptable frequency)
- 🟡 Requires error handling for permissions
- 🟡 **Migration needed if upgrading from old config location**

### Decision 4: Granular Startup Phases

**Problem**: Single "starting" state doesn't provide enough feedback.

**Options Considered**:

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| A. Single "starting" state | Simple | Poor UX | ❌ Current |
| B. Emit phase events via IPC | Rich feedback | More IPC messages | ✅ **Chosen** |
| C. Poll-based phase detection | Decoupled | Complex, delayed | ❌ Rejected |

**Chosen Approach**: Option B - Emit phase events

**Rationale**:
- Real-time feedback for users
- Minimal overhead (few events per startup)
- Extensible for future phases
- Aligns with existing IPC patterns

**Implementation**:

```typescript
enum StartupPhase {
  CheckingPort = 'checking_port',
  Spawning = 'spawning',
  WaitingListening = 'waiting_listening',
  HealthCheck = 'health_check',
  Running = 'running'
}

// During start()
this.emitPhase(StartupPhase.CheckingPort);
await this.checkPortAvailable();

this.emitPhase(StartupPhase.Spawning);
this.process = spawn(...);

this.emitPhase(StartupPhase.WaitingListening);
await this.waitForPortListening();

this.emitPhase(StartupPhase.HealthCheck);
await this.performHealthCheck();

this.emitPhase(StartupPhase.Running);
```

**Trade-offs**:
- ✅ Clear user feedback
- ✅ Easy to add new phases
- ✅ Aligns with existing status pattern
- 🟡 More IPC traffic (negligible)

## Component Interactions

### Enhanced Startup Flow

```
┌──────────────────┐
│  App Ready       │
│  (main.ts)       │
└────────┬─────────┘
         │
         │ 1. Initialize managers
         ▼
┌──────────────────┐
│  Port Pre-Check  │◄─────────────────────┐
│  (async)         │                      │
└────────┬─────────┘                      │
         │                               │
         │ 2. Emit port status           │
         ▼                               │
┌──────────────────┐                      │
│  UI Displays     │                      │
│  Port Warning    │                      │
└──────────────────┘                      │
         │                                │
         │ 3. User clicks "Start"        │
         ▼                                │
┌──────────────────┐                      │
│  checkPort       │                      │
└────────┬─────────┘                      │
         │ Available?                    │
         ├───────────No────────► [ERROR]  │
         │ Yes                           │
         ▼                                │
┌──────────────────┐                      │
│  spawn Process   │                      │
└────────┬─────────┘                      │
         │                               │
         │ 4. Process spawning           │
         ▼                                │
┌──────────────────┐                      │
│  waitForListening│                      │
└────────┬─────────┘                      │
         │ Listening?                    │
         ├───────────No────────► [TIMEOUT]│
         │ Yes                           │
         ▼                                │
┌──────────────────┐                      │
│  healthCheck     │                      │
└────────┬─────────┘                      │
         │ Healthy?                      │
         ├───────────No────────► [ERROR]  │
         │ Yes                           │
         ▼                                │
┌──────────────────┐                      │
│  Running         │                      │
└──────────────────┘                      │
         │                               │
         │ 5. User changes port          │
         ▼                                │
┌──────────────────┐                      │
│  updateConfig    │                      │
│  syncConfigToFile│──────────────────────┘
└──────────────────┘

         │ 6. App quits
         ▼
┌──────────────────┐
│  before-quit     │
│  cleanup()       │
│  stop()          │
└──────────────────┘
```

## Data Flow

### Configuration Sync Flow

```
┌─────────────────────┐
│ User Input (UI)     │
│ Port: 5000 → 5001   │
└──────────┬──────────┘
           │ IPC: 'set-web-service-config'
           ▼
┌─────────────────────┐
│ main.ts IPC Handler │
│ updateConfig()      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ PCodeWebService     │
│ .updateConfig()     │
└──────────┬──────────┘
           │
           ├─────────────────────┐
           │                     │
           ▼                     ▼
┌──────────────────┐  ┌──────────────────────┐
│ Update Memory    │  │ syncConfigToFile()   │
│ this.config.port │  │ - Read appsettings   │
│                  │  │ - Modify Urls        │
│                  │  │ - Write back         │
└──────────────────┘  └──────────┬───────────┘
                                 │
                                 │ File System
                                 ▼
                       ┌──────────────────────┐
                       │ Config/appsettings   │
                       │ Urls: http://...:5001│
                       └──────────────────────┘
```

## Error Handling Strategy

### Process Spawn Failures

```typescript
try {
  this.process = spawn(command, args, options);
} catch (error) {
  this.status = 'error';
  // Emit error phase to UI
  this.emitPhase('error', { reason: 'spawn_failed', message: error.message });
  return false;
}
```

### Config File I/O Failures

```typescript
try {
  await this.syncConfigToFile();
} catch (error) {
  if (error.code === 'EACCES') {
    log.error('[WebService] Permission denied writing config');
    // Notify user but continue with in-memory config
  } else if (error.code === 'ENOENT') {
    log.error('[WebService] Config file not found');
    // Continue without sync
  }
}
```

### Port Check Failures

```typescript
try {
  const available = await this.checkPortAvailable();
  if (!available) {
    // Emit specific error for UI
    this.emitPhase('error', { reason: 'port_in_use', port: this.config.port });
    return false;
  }
} catch (error) {
  log.error('[WebService] Port check failed:', error);
  // Continue to spawn attempt (let OS handle it)
}
```

## Testing Considerations

### Unit Tests Required

1. **Port Check**:
   - Available port returns `true`
   - Occupied port returns `false`
   - Network error handling

2. **Config Sync**:
   - Write valid YAML
   - Preserve existing config structure
   - Handle file permission errors

3. **Process Lifecycle**:
   - Cleanup called on `before-quit`
   - Force kill terminates process group
   - Orphan process prevention

### Integration Tests Required

1. **Full Startup Flow**:
   - Port check → spawn → listening → health check → running
   - Error scenarios at each phase

2. **Config Persistence**:
   - Update config → restart → verify new port used

3. **App Exit Scenarios**:
   - Normal quit → process cleanup
   - Crash/kill → process cleanup

### Platform-Specific Tests

- **Linux**: Process group creation, shell script execution
- **Windows**: Detached process, taskkill behavior
- **macOS**: Process group, app lifecycle

## Security Considerations

1. **Config File Permissions**: Ensure `appsettings.yml` is writable by application
2. **Process Privileges**: Child process shouldn't gain elevated privileges
3. **Port Binding**: Verify port is not in privileged range (<1024) without permissions
4. **File Injection**: Validate file paths to prevent directory traversal

## Performance Impact

| Operation | Before | After | Impact |
|-----------|--------|-------|--------|
| App Startup | ~500ms | ~600ms | +100ms (port check) |
| Service Start | ~3-5s | ~3-5s | No change |
| Config Update | <1ms | ~50ms | +50ms (file sync) |
| App Shutdown | ~200ms | ~300ms | +100ms (cleanup) |

**Overall**: Minimal impact, well within acceptable thresholds.

## Backward Compatibility

- ✅ No API changes to public methods
- ✅ Existing IPC handlers unchanged
- ✅ New IPC handlers are additive
- ✅ Config file format unchanged
- ✅ Process behavior on Windows unchanged

## Future Extensions

This design enables future enhancements:

1. **Dynamic Port Allocation**: Can add port discovery to pre-check phase
2. **Multiple Instances**: Config sync infrastructure supports multiple configs
3. **Service Discovery**: Phase events enable service registration
4. **Health Monitoring**: Granular phases allow detailed metrics

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Config file corruption | High | Low | Backup before write, validate YAML |
| Process cleanup failure | High | Medium | Multiple kill strategies, logging |
| Port check false positives | Medium | Low | Retry logic, OS-level validation |
| File permission errors | Medium | Medium | Graceful degradation, user notification |
| Platform-specific bugs | High | Medium | Comprehensive testing, fallback logic |

## Open Questions

1. **Should we implement periodic port status checks?**
   - Current: Single check at initialization
   - Consider: Background polling every 30s
   - Decision: Deferred to future iteration (out of scope)

2. **How should we handle config file read errors?**
   - Current: Log and continue with in-memory config
   - Consider: Alert user, block service start
   - Decision: Graceful degradation (log and continue)

3. **Should port check be blocking or non-blocking in UI?**
   - Current: Blocking, but fast (<100ms)
   - Consider: Show loading indicator
   - Decision: Keep blocking (too fast to notice)

## Appendix: Platform-Specific Behaviors

### Linux
- Process group creation via `setsid()` or `detached: false`
- Kill via `process.kill(-pid, 'SIGKILL')`
- Shell script execution via `sh start.sh`

### Windows
- Detached process with `windowsHide: true`
- Kill via `taskkill /F /T /PID <pid>`
- Direct executable execution

### macOS
- Same as Linux (Unix-based)
- Process group management
- Consider App Nap behavior

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Claude | Initial design document |
