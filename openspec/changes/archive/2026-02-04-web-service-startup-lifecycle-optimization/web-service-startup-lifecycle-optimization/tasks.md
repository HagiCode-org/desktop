# Web Service Startup Lifecycle Optimization - Implementation Tasks

## Overview

This document outlines the ordered implementation tasks for optimizing Web service startup lifecycle management. Tasks are organized by phase and include dependencies, verification steps, and estimated complexity.

## Phase 1: Process Lifecycle Binding

**Goal**: Ensure child processes terminate when parent application exits.

**Dependencies**: None
**Blocks**: Phase 2, 3, 4 (can be done in parallel)

---

### Task 1.1: Modify `getSpawnOptions()` for Unix Platforms

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts:86-101`

**Changes**:
- Update `getSpawnOptions()` to explicitly set `detached: false` for Linux and macOS
- Ensure `stdio` is set to `'ignore'` to prevent pipe inheritance issues
- Keep Windows behavior unchanged (`detached: true`, `windowsHide: true`)

**Implementation**:
```typescript
private getSpawnOptions() {
  const platform = process.platform;
  const executablePath = this.getExecutablePath();
  const options: any = {
    env: { ...process.env, ...this.config.env },
    cwd: path.dirname(executablePath),
  };

  if (platform === 'win32') {
    // Windows: detach to run independently
    options.detached = true;
    options.windowsHide = true;
  } else {
    // Linux/macOS: keep attached for lifecycle management
    options.detached = false;
    options.stdio = 'ignore';
  }

  return options;
}
```

**Verification**:
- Unit test: Verify options for each platform
- Manual test: Start service on Linux, check process group with `ps -ef | grep start.sh`

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: None

---

### Task 1.2: Implement `before-quit` Event Handler

- [x] **COMPLETED**

**File**: `src/main/main.ts:397-399`

**Changes**:
- Add cleanup call to existing `before-quit` handler
- Ensure `webServiceManager.cleanup()` is called before `destroyTray()`
- Add error handling to prevent blocking quit

**Implementation**:
```typescript
app.on('before-quit', async (event) => {
  // Prevent default to allow async cleanup
  event.preventDefault();

  try {
    log.info('[App] Cleaning up before quit...');
    if (webServiceManager) {
      await webServiceManager.cleanup();
    }
    destroyTray();
  } catch (error) {
    log.error('[App] Error during cleanup:', error);
  } finally {
    // Ensure app quits even if cleanup fails
    app.exit(0);
  }
});
```

**Verification**:
- Manual test: Start service, quit app normally, verify process terminates
- Manual test: Start service, kill app process, verify child terminates
- Check logs for cleanup messages

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: Task 1.1

---

### Task 1.3: Enhance `forceKill()` for Process Groups

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts:349-379`

**Changes**:
- Modify `forceKill()` to use negative PID on Unix systems (kills process group)
- Add fallback to individual PID kill if group kill fails
- Improve logging for debugging

**Implementation**:
```typescript
private async forceKill(): Promise<void> {
  if (!this.process) return;

  const platform = process.platform;
  const pid = this.process.pid;

  if (!pid) {
    this.process = null;
    return;
  }

  try {
    if (platform === 'win32') {
      // Windows: use taskkill to terminate process tree
      const { spawn } = await import('child_process');
      spawn('taskkill', ['/F', '/T', '/PID', pid.toString()], {
        stdio: 'ignore',
      });
    } else {
      // Unix: kill process group using negative PID
      try {
        process.kill(-pid, 'SIGKILL');
        log.info('[WebService] Killed process group:', -pid);
      } catch (groupError) {
        // Fallback: kill individual process
        log.warn('[WebService] Group kill failed, trying individual PID:', pid);
        process.kill(pid, 'SIGKILL');
      }
    }

    // Wait a bit for the process to die
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    log.error('[WebService] Force kill failed:', error);
  }

  this.process = null;
}
```

**Verification**:
- Unit test: Mock process and verify kill commands
- Manual test (Linux): Start service, force kill, verify all children terminated
- Manual test (Windows): Verify taskkill command executed

**Complexity**: Medium | **Estimated Time**: 1 hour

**Dependencies**: Task 1.1

---

## Phase 2: Startup Port Conflict Detection

**Goal**: Detect and warn about port conflicts at application startup.

**Dependencies**: None (can be done in parallel with Phase 1)
**Blocks**: Phase 4 (UI components)

---

### Task 2.1: Make `checkPortAvailable()` Public

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts:132-148`

**Changes**:
- Change visibility from `private` to `public`
- Add JSDoc comment for external usage
- No logic changes

**Implementation**:
```typescript
/**
 * Check if the configured port is available
 * @returns Promise resolving to true if port is available, false if in use
 */
public async checkPortAvailable(): Promise<boolean> {
  // ... existing implementation unchanged
}
```

**Verification**:
- Compilation check: Ensure method is accessible from `main.ts`

**Complexity**: Trivial | **Estimated Time**: 5 minutes

**Dependencies**: None

---

### Task 2.2: Add IPC Handler for Port Status

- [x] **COMPLETED**

**File**: `src/main/main.ts` (after existing IPC handlers)

**Changes**:
- Add new IPC handler `check-web-service-port`
- Return port status object with port number and availability

**Implementation**:
```typescript
ipcMain.handle('check-web-service-port', async () => {
  if (!webServiceManager) {
    return {
      port: 5000,
      available: false,
      error: 'Web service manager not initialized'
    };
  }
  try {
    const available = await webServiceManager.checkPortAvailable();
    const config = (webServiceManager as any).config; // Access config for port
    return {
      port: config.port,
      available,
      error: null
    };
  } catch (error) {
    console.error('Failed to check port:', error);
    return {
      port: 5000,
      available: false,
      error: error.message
    };
  }
});
```

**Verification**:
- Manual test: Call from renderer process, verify response format
- Unit test: Mock handler and test response structure

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: Task 2.1

---

### Task 2.3: Add Port Status to Redux Store

- [x] **COMPLETED**

**File**: `src/renderer/store/slices/` (new file `webServiceSlice.ts` or existing)

**Changes**:
- Add `portAvailable` field to web service state
- Add `portStatusChecked` flag
- Add action to update port status

**Implementation**:
```typescript
interface WebServiceState {
  status: ProcessStatus;
  pid: number | null;
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  portAvailable: boolean;
  portStatusChecked: boolean;
}

const initialState: WebServiceState = {
  // ... existing fields
  portAvailable: true,
  portStatusChecked: false,
};

// Action
export const updatePortStatus = createAction<{
  available: boolean;
}>('webService/updatePortStatus');

// Reducer
case updatePortStatus.type: {
  state.portAvailable = action.payload.available;
  state.portStatusChecked = true;
  break;
}
```

**Verification**:
- Unit test: Dispatch action, verify state updates
- Type check: Ensure type safety

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: None

---

### Task 2.4: Call Port Check at App Initialization

- [x] **COMPLETED**

**File**: `src/main/main.ts:367-387`

**Changes**:
- After `webServiceManager` initialization, call `checkPortAvailable()`
- Emit result to renderer process via `webContents.send()`
- Handle errors gracefully

**Implementation**:
```typescript
app.whenReady().then(async () => {
  // ... existing initialization

  webServiceManager = new PCodeWebServiceManager(webServiceConfig);

  // Check port availability immediately
  try {
    const portAvailable = await webServiceManager.checkPortAvailable();
    mainWindow?.on('ready-to-show', () => {
      mainWindow?.webContents.send('web-service-port-status', {
        port: webServiceConfig.port,
        available: portAvailable
      });
    });
  } catch (error) {
    log.error('[App] Failed to check port availability:', error);
  }

  // ... rest of initialization
});
```

**Verification**:
- Manual test: Start app with port available, check console for status
- Manual test: Start app with port occupied (use `nc -l 5000`), verify error message
- Check logs for port check results

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: Task 2.1, Task 2.2

---

### Task 2.5: Display Port Status in UI

**File**: `src/renderer/components/WebServiceStatusCard.tsx`

**Changes**:
- Add port status warning banner
- Show when `portStatusChecked` is true and `portAvailable` is false
- Style with warning colors (yellow/orange)

**Implementation**:
```tsx
{!portAvailable && portStatusChecked && (
  <Alert variant="destructive" className="mb-4">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Port Conflict</AlertTitle>
    <AlertDescription>
      Port {port} is already in use. The web service may fail to start.
      Please stop the conflicting application or change the port.
    </AlertDescription>
  </Alert>
)}
```

**Verification**:
- Manual test: Block port, start app, verify warning appears
- Visual test: Verify alert styling matches design system
- Accessibility test: Check screen reader announcement

**Complexity**: Low | **Estimated Time**: 45 minutes

**Dependencies**: Task 2.3, Task 2.4

---

## Phase 3: Configuration File Synchronization & Port Persistence

**Goal**: Keep runtime config and `appsettings.yml` synchronized, and persist successful port configurations for automatic recovery.

**Dependencies**: None (can be done in parallel with Phases 1-2)
**Blocks**: None (independent feature)

---

### Task 3.1: Add Config File Path Helper

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new private method)

**Changes**:
- Add method to get platform-specific config file path
- Reuse existing path logic from `getVersion()`

**Implementation**:
```typescript
private getConfigFilePath(): string {
  const installedPath = path.join(this.userDataPath, 'pcode-web', 'installed');
  const platform = process.platform;

  switch (platform) {
    case 'win32':
      return path.join(installedPath, 'win-x64', 'appsettings.yml');
    case 'darwin':
      return path.join(installedPath, 'osx-x64', 'appsettings.yml');
    case 'linux':
      return path.join(installedPath, 'linux-x64', 'appsettings.yml');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
```

**Verification**:
- Unit test: Verify correct path for each platform
- Manual test: Log path, verify file exists

**Complexity**: Trivial | **Estimated Time**: 15 minutes

**Dependencies**: None

---

### Task 3.2: Implement `syncConfigToFile()` Method

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new private method)

**Changes**:
- Read existing `appsettings.yml`
- Update `Urls` field with current port/host
- Write back to file preserving YAML structure
- Call `saveLastSuccessfulPort()` to persist port for recovery

**Implementation**:
```typescript
private async syncConfigToFile(): Promise<void> {
  try {
    const configPath = this.getConfigFilePath();
    const yaml = await import('js-yaml');

    // Read existing config
    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(content) as any;

    // Update URLs
    config.Urls = `http://${this.config.host}:${this.config.port}`;

    // Write back
    const newContent = yaml.dump(config, {
      lineWidth: -1, // Don't wrap lines
      noRefs: true,
    });
    await fs.writeFile(configPath, newContent, 'utf-8');

    log.info('[WebService] Config synced to file:', configPath);

    // Persist successful port for next startup
    await this.saveLastSuccessfulPort(this.config.port);
  } catch (error) {
    log.error('[WebService] Failed to sync config to file:', error);
    throw error; // Re-throw for caller to handle
  }
}
```

**Verification**:
- Unit test: Mock fs operations, verify YAML structure
- Manual test: Change port, check file contents
- Manual test: Verify YAML formatting is preserved
- Manual test: Verify port is saved to userData config

**Complexity**: Medium | **Estimated Time**: 1.5 hours

**Dependencies**: Task 3.1, Task 3.5 (saveLastSuccessfulPort)

---

### Task 3.3: Modify `updateConfig()` to Sync File

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts:473-475`

**Changes**:
- Make `updateConfig()` async
- Detect if port/host changed
- Call `syncConfigToFile()` after update
- Handle file sync errors gracefully

**Implementation**:
```typescript
async updateConfig(config: Partial<WebServiceConfig>): Promise<void> {
  const oldPort = this.config.port;
  const oldHost = this.config.host;

  this.config = { ...this.config, ...config };

  // Sync to file if host or port changed
  if ((config.port && config.port !== oldPort) ||
      (config.host && config.host !== oldHost)) {
    try {
      await this.syncConfigToFile();
    } catch (error) {
      log.error('[WebService] Config sync failed, continuing with in-memory config');
      // Don't throw - allow in-memory config to work
    }
  }
}
```

**Verification**:
- Unit test: Call with port change, verify file updated
- Unit test: Call with same port, verify no file write
- Manual test: Change port via UI, restart app, verify new port used

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: Task 3.2

---

### Task 3.4: Update IPC Handler for Config Changes

- [x] **COMPLETED**

**File**: `src/main/main.ts` (add new handler)

**Changes**:
- Add IPC handler for updating web service config
- Call `updateConfig()` and handle errors
- Return success/failure status

**Implementation**:
```typescript
ipcMain.handle('set-web-service-config', async (_, config: Partial<WebServiceConfig>) => {
  if (!webServiceManager) {
    return { success: false, error: 'Web service manager not initialized' };
  }
  try {
    await webServiceManager.updateConfig(config);
    return { success: true, error: null };
  } catch (error) {
    console.error('Failed to update web service config:', error);
    return { success: false, error: error.message };
  }
});
```

**Verification**:
- Manual test: Change port via UI, verify file updated
- Error test: Make file read-only, verify graceful handling

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: Task 3.3

---

### Task 3.5: Implement `loadSavedPort()` Method

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new private method)

**Changes**:
- Read saved port from `userData/config/web-service.json`
- Return `null` if no saved config exists
- Handle file read errors gracefully
- **Ensure config directory exists before reading**

**Implementation**:
```typescript
private async loadSavedPort(): Promise<number | null> {
  const configDir = path.join(this.userDataPath, 'config');
  const configPath = path.join(configDir, 'web-service.json');

  try {
    // Ensure config directory exists
    await fs.mkdir(configDir, { recursive: true });

    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.lastSuccessfulPort || null;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log.error('[WebService] Error loading saved port:', error);
    } else {
      log.info('[WebService] No saved port configuration found');
    }
    return null;
  }
}
```

**Verification**:
- Unit test: Mock fs.readFile, verify port is returned
- Unit test: Test file not found error, verify `null` returned
- Unit test: Verify config directory is created if missing
- Manual test: First run (no saved config), verify returns `null`

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: None

---

### Task 3.6: Implement `saveLastSuccessfulPort()` Method

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new private method)

**Changes**:
- Write port to `userData/config/web-service.json`
- Include timestamp for debugging
- Handle write errors gracefully
- **Ensure config directory exists before writing**

**Implementation**:
```typescript
private async saveLastSuccessfulPort(port: number): Promise<void> {
  const configDir = path.join(this.userDataPath, 'config');
  const configPath = path.join(configDir, 'web-service.json');

  try {
    // Ensure config directory exists
    await fs.mkdir(configDir, { recursive: true });

    const config = {
      lastSuccessfulPort: port,
      savedAt: new Date().toISOString()
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    log.info('[WebService] Saved successful port:', port);
  } catch (error) {
    log.error('[WebService] Failed to save port configuration:', error);
    // Don't throw - port persistence is not critical
  }
}
```

**Verification**:
- Unit test: Mock fs.writeFile, verify config written
- Manual test: Change port, verify file created in `userData/config/`
- Error test: Make userData read-only, verify graceful handling
- Manual test: Verify `config/` directory is created if missing

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: None

---

### Task 3.7: Load Saved Port on Manager Initialization

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (constructor)

**Changes**:
- Call `loadSavedPort()` during initialization
- Use saved port if available and valid
- Fallback to default port if no saved port or saved port unavailable

**Implementation**:
```typescript
constructor(config: WebServiceConfig) {
  this.config = config;
  this.status = 'stopped';
  // ... existing initialization

  // Load saved port asynchronously
  this.initializeSavedPort();
}

private async initializeSavedPort(): Promise<void> {
  try {
    const savedPort = await this.loadSavedPort();
    if (savedPort && savedPort !== this.config.port) {
      // Check if saved port is available
      const available = await this.checkPortAvailable(savedPort);
      if (available) {
        log.info('[WebService] Using saved port:', savedPort);
        this.config.port = savedPort;
      } else {
        log.warn('[WebService] Saved port unavailable, using default:', this.config.port);
      }
    }
  } catch (error) {
    log.error('[WebService] Failed to load saved port:', error);
  }
}
```

**Verification**:
- Manual test: First run, verify default port used
- Manual test: Change port, restart app, verify saved port used
- Manual test: Block saved port, restart app, verify fallback to default
- Check logs for port loading messages

**Complexity**: Medium | **Estimated Time**: 1 hour

**Dependencies**: Task 3.5, Task 3.6

---

### Task 3.8: Save Port After Successful Service Start

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (in `start()` method)

**Changes**:
- After health check passes, call `saveLastSuccessfulPort()`
- Ensure port is persisted only on successful startup
- Update existing `syncConfigToFile()` call (Task 3.2)

**Implementation**:
```typescript
// In start() method after health check succeeds
if (healthCheckPassed) {
  this.status = 'running';
  this.startTime = Date.now();

  // Persist successful port
  await this.saveLastSuccessfulPort(this.config.port);

  this.emitPhase(StartupPhase.Running, 'Service is running');
  log.info('[WebService] Started successfully, PID:', this.process.pid);
  return true;
}
```

**Verification**:
- Manual test: Start service successfully, verify config file created
- Manual test: Failed startup (port blocked), verify port NOT saved
- Manual test: Restart app, verify saved port is loaded

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: Task 3.6, Task 3.7

---

### Task 3.9: Implement Config Migration from Legacy Location

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new private method)

**Changes**:
- Check for legacy config file at `userData/web-service-config.json`
- If found, migrate to new location `userData/config/web-service.json`
- Delete legacy file after successful migration
- Log migration for debugging

**Implementation**:
```typescript
private async migrateLegacyConfig(): Promise<void> {
  const legacyPath = path.join(this.userDataPath, 'web-service-config.json');
  const newDir = path.join(this.userDataPath, 'config');
  const newPath = path.join(newDir, 'web-service.json');

  try {
    // Check if legacy config exists
    await fs.access(legacyPath);

    log.info('[WebService] Migrating config from legacy location');
    const content = await fs.readFile(legacyPath, 'utf-8');

    // Ensure new config directory exists
    await fs.mkdir(newDir, { recursive: true });

    // Copy to new location
    await fs.writeFile(newPath, content, 'utf-8');

    // Delete legacy file
    await fs.unlink(legacyPath);

    log.info('[WebService] Config migration completed');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No legacy config, nothing to migrate
      log.info('[WebService] No legacy config found, skipping migration');
    } else {
      log.error('[WebService] Config migration failed:', error);
      // Continue with new config location
    }
  }
}
```

**Verification**:
- Manual test: Create legacy config file, start app, verify migration
- Manual test: Verify legacy file deleted after migration
- Manual test: Verify new config file created with correct content
- Manual test: Second run (already migrated), verify no migration attempt
- Check logs for migration messages

**Complexity**: Low | **Estimated Time**: 45 minutes

**Dependencies**: Task 3.5, Task 3.6

---

### Task 3.10: Call Migration on Manager Initialization

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (constructor or init)

**Changes**:
- Call `migrateLegacyConfig()` during initialization
- Ensure migration runs before loading config
- Handle migration errors gracefully

**Implementation**:
```typescript
private async initializeSavedPort(): Promise<void> {
  try {
    // Run migration first (one-time operation)
    await this.migrateLegacyConfig();

    // Load saved port
    const savedPort = await this.loadSavedPort();
    if (savedPort && savedPort !== this.config.port) {
      // Check if saved port is available
      const available = await this.checkPortAvailable(savedPort);
      if (available) {
        log.info('[WebService] Using saved port:', savedPort);
        this.config.port = savedPort;
      } else {
        log.warn('[WebService] Saved port unavailable, using default:', this.config.port);
      }
    }
  } catch (error) {
    log.error('[WebService] Failed to load saved port:', error);
  }
}
```

**Verification**:
- Manual test: Fresh install, verify no migration errors
- Manual test: Upgrading from old version, verify migration runs
- Check logs to verify migration timing

**Complexity**: Trivial | **Estimated Time**: 15 minutes

**Dependencies**: Task 3.9

---

## Phase 4: Enhanced Status Feedback

**Goal**: Provide granular feedback during service startup.

**Dependencies**: Phases 1-2 (requires port check and process management)
**Blocks**: None (final phase)

---

### Task 4.1: Define Startup Phase Enum

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new type definition)

**Changes**:
- Add `StartupPhase` enum
- Add phase to status info interface
- Extend `ProcessInfo` type

**Implementation**:
```typescript
export enum StartupPhase {
  Idle = 'idle',
  CheckingPort = 'checking_port',
  Spawning = 'spawning',
  WaitingListening = 'waiting_listening',
  HealthCheck = 'health_check',
  Running = 'running',
  Error = 'error'
}

export interface ProcessInfo {
  status: ProcessStatus;
  pid: number | null;
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  phase: StartupPhase;
  phaseMessage?: string;
}
```

**Verification**:
- Type check: Ensure no type errors in existing code

**Complexity**: Trivial | **Estimated Time**: 15 minutes

**Dependencies**: None

---

### Task 4.2: Implement Phase Emission Helper

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new private method)

**Changes**:
- Add method to emit phase updates to renderer
- Include phase and optional message
- Use existing IPC pattern from main.ts

**Implementation**:
```typescript
private emitPhase(phase: StartupPhase, message?: string): void {
  // Store phase for getStatus()
  this.currentPhase = phase;

  // Emit to renderer if window available
  // Note: Need reference to mainWindow, passed via constructor or global
  if (global.mainWindow) {
    global.mainWindow.webContents.send('web-service-startup-phase', {
      phase,
      message,
      timestamp: Date.now()
    });
  }

  log.info('[WebService] Phase:', phase, message || '');
}
```

**Verification**:
- Manual test: Start service, check console for phase logs
- Manual test: Verify IPC messages received in renderer

**Complexity**: Low | **Estimated Time**: 45 minutes

**Dependencies**: Task 4.1

---

### Task 4.3: Add Port Listening Detection

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts` (new private method)

**Changes**:
- Add method to check if process is listening on port
- Use net connection attempt with timeout
- Return true when port accepts connections

**Implementation**:
```typescript
private async waitForPortListening(timeout: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  const net = await import('node:net');

  while (Date.now() - startTime < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);

        socket.on('connect', () => {
          socket.destroy();
          resolve();
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Timeout'));
        });

        socket.on('error', () => {
          socket.destroy();
          reject(new Error('Connection refused'));
        });

        socket.connect(this.config.port, this.config.host);
      });
      return true; // Port is listening
    } catch {
      // Port not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return false; // Timeout
}
```

**Verification**:
- Unit test: Mock socket, verify retry logic
- Manual test: Start service, verify phase transitions

**Complexity**: Medium | **Estimated Time**: 1 hour

**Dependencies**: Task 4.2

---

### Task 4.4: Integrate Phases into `start()` Method

- [x] **COMPLETED**

**File**: `src/main/web-service-manager.ts:168-232`

**Changes**:
- Add phase emissions at each step
- Insert port listening detection between spawn and health check
- Update error handling to emit error phase

**Implementation**:
```typescript
async start(): Promise<boolean> {
  if (this.process) {
    log.warn('[WebService] Process already running');
    return false;
  }

  if (this.restartCount >= this.maxRestartAttempts) {
    log.error('[WebService] Max restart attempts reached');
    this.status = 'error';
    this.emitPhase(StartupPhase.Error, 'Max restart attempts reached');
    return false;
  }

  try {
    this.status = 'starting';
    this.emitPhase(StartupPhase.CheckingPort, 'Checking port availability...');

    // Check executable
    const executablePath = this.getExecutablePath();
    try {
      await fs.access(executablePath);
    } catch {
      log.error('[WebService] Executable not found:', executablePath);
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'Executable not found');
      return false;
    }

    // Check port
    const portAvailable = await this.checkPortAvailable();
    if (!portAvailable) {
      log.error('[WebService] Port already in use:', `${this.config.host}:${this.config.port}`);
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'Port already in use');
      return false;
    }

    // Spawn
    this.emitPhase(StartupPhase.Spawning, 'Starting service process...');
    const options = this.getSpawnOptions();
    const { command, args } = this.getSpawnCommand();
    log.info('[WebService] Spawning process:', command, args.join(' '));
    this.process = spawn(command, args, options);
    this.setupProcessHandlers();

    // Wait for listening
    this.emitPhase(StartupPhase.WaitingListening, 'Waiting for service to start listening...');
    const listening = await this.waitForPortListening();
    if (!listening) {
      log.error('[WebService] Process not listening on port');
      this.emitPhase(StartupPhase.Error, 'Service failed to start listening');
      await this.stop();
      this.status = 'error';
      return false;
    }

    // Health check
    this.emitPhase(StartupPhase.HealthCheck, 'Performing health check...');
    const healthCheckPassed = await this.waitForHealthCheck();

    if (healthCheckPassed) {
      this.status = 'running';
      this.startTime = Date.now();
      this.emitPhase(StartupPhase.Running, 'Service is running');
      log.info('[WebService] Started successfully, PID:', this.process.pid);
      return true;
    } else {
      log.error('[WebService] Health check failed');
      this.emitPhase(StartupPhase.Error, 'Health check failed');
      await this.stop();
      this.status = 'error';
      return false;
    }
  } catch (error) {
    log.error('[WebService] Failed to start:', error);
    this.status = 'error';
    this.process = null;
    this.emitPhase(StartupPhase.Error, `Start failed: ${error.message}`);
    return false;
  }
}
```

**Verification**:
- Manual test: Start service, observe all phases in sequence
- Manual test: Force failure at each phase, verify error phase
- Console log: Verify phase messages appear in order

**Complexity**: Medium | **Estimated Time**: 1.5 hours

**Dependencies**: Task 4.2, Task 4.3

---

### Task 4.5: Add Phase to Redux State

- [x] **COMPLETED**

**File**: `src/renderer/store/slices/` (web service slice)

**Changes**:
- Add `phase` and `phaseMessage` fields to state
- Add reducer action for phase updates
- Initialize with `StartupPhase.Idle`

**Implementation**:
```typescript
interface WebServiceState {
  // ... existing fields
  phase: StartupPhase;
  phaseMessage: string | null;
}

const initialState: WebServiceState = {
  // ... existing fields
  phase: StartupPhase.Idle,
  phaseMessage: null,
};

// Action
export const updateStartupPhase = createAction<{
  phase: StartupPhase;
  message?: string;
}>('webService/updateStartupPhase');

// Reducer
case updateStartupPhase.type: {
  state.phase = action.payload.phase;
  state.phaseMessage = action.payload.message || null;
  break;
}
```

**Verification**:
- Unit test: Dispatch actions, verify state updates

**Complexity**: Low | **Estimated Time**: 30 minutes

**Dependencies**: Task 4.1

---

### Task 4.6: Listen for Phase Events in Renderer

**File**: `src/renderer/main.tsx` or component setup

**Changes**:
- Add IPC listener for `web-service-startup-phase`
- Dispatch Redux action when phase received
- Handle in preload script for type safety

**Implementation**:
```typescript
// In preload
api.onWebServiceStartupPhase((callback) => {
  ipcRenderer.on('web-service-startup-phase', (_event, data) => callback(data));
});

// In renderer
useEffect(() => {
  const unsubscribe = window.electronAPI.onWebServiceStartupPhase((data) => {
    dispatch(updateStartupPhase({
      phase: data.phase,
      message: data.message
    }));
  });

  return () => {
    unsubscribe?.();
  };
}, [dispatch]);
```

**Verification**:
- Manual test: Start service, verify phases appear in Redux DevTools
- Integration test: Mock IPC event, verify action dispatched

**Complexity**: Medium | **Estimated Time**: 1 hour

**Dependencies**: Task 4.5

---

### Task 4.7: Display Phase Progress in UI

**File**: `src/renderer/components/WebServiceStatusCard.tsx`

**Changes**:
- Add progress indicator showing current phase
- Display phase message as subtitle
- Use distinct visual states for each phase

**Implementation**:
```tsx
{status === 'starting' && phase !== StartupPhase.Idle && (
  <div className="space-y-2">
    <div className="flex items-center space-x-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm font-medium">
        {phase === StartupPhase.CheckingPort && 'Checking Port...'}
        {phase === StartupPhase.Spawning && 'Starting Process...'}
        {phase === StartupPhase.WaitingListening && 'Waiting for Service...'}
        {phase === StartupPhase.HealthCheck && 'Checking Health...'}
      </span>
    </div>
    {phaseMessage && (
      <p className="text-sm text-muted-foreground">{phaseMessage}</p>
    )}

    {/* Phase progress bar */}
    <Progress
      value={
        phase === StartupPhase.CheckingPort ? 20 :
        phase === StartupPhase.Spawning ? 40 :
        phase === StartupPhase.WaitingListening ? 60 :
        phase === StartupPhase.HealthCheck ? 80 : 100
      }
      className="h-2"
    />
  </div>
)}
```

**Verification**:
- Visual test: Start service, verify progress indicator flows smoothly
- Manual test: Force errors, verify error phases displayed correctly
- Accessibility test: Check screen reader announcements

**Complexity**: Medium | **Estimated Time**: 1.5 hours

**Dependencies**: Task 4.6

---

## Phase 5: Testing & Validation

**Goal**: Comprehensive testing across all phases.

**Dependencies**: All implementation phases complete

---

### Task 5.1: Unit Tests for Process Management

**Files**: New test files in `src/main/__tests__/`

**Test Cases**:
- `getSpawnOptions()` returns correct options per platform
- `forceKill()` uses correct kill strategy per platform
- `cleanup()` stops running process
- `updateConfig()` updates in-memory config

**Implementation**:
- Use Jest or Vitest framework
- Mock `child_process.spawn` and file system
- Test error scenarios

**Complexity**: Medium | **Estimated Time**: 2 hours

**Dependencies**: Tasks 1.1, 1.3, 3.3

---

### Task 5.2: Unit Tests for Port Checking

**Files**: New test files in `src/main/__tests__/`

**Test Cases**:
- `checkPortAvailable()` returns true for available port
- `checkPortAvailable()` returns false for occupied port
- `waitForPortListening()` times out correctly
- Retry logic works as expected

**Implementation**:
- Mock `net.createServer` and `net.Socket`
- Test timeout scenarios
- Verify retry intervals

**Complexity**: Medium | **Estimated Time**: 1.5 hours

**Dependencies**: Tasks 2.1, 4.3

---

### Task 5.3: Integration Tests for Full Startup Flow

**Files**: New test files in `src/main/__tests__/`

**Test Cases**:
- Successful startup: all phases in order
- Port conflict during startup: error phase emitted
- Executable not found: error phase emitted
- Health check failure: error phase emitted
- Abnormal exit: process cleanup triggered

**Implementation**:
- Integration test with real process (if possible)
- Or comprehensive mocking with realistic timing
- Verify IPC events emitted in correct order

**Complexity**: High | **Estimated Time**: 3 hours

**Dependencies**: All Phase 4 tasks

---

### Task 5.4: Manual Testing on All Platforms

**Environment**: Linux, Windows, macOS

**Test Scenarios**:

1. **Normal Startup**:
   - Start service, verify all phases complete
   - Check process appears in system monitor
   - Verify service accessible at URL

2. **Port Conflict**:
   - Occupy port with `nc -l 5000`
   - Start app, verify warning appears
   - Attempt to start service, verify error message

3. **Config Sync**:
   - Change port via UI
   - Check `appsettings.yml` updated
   - Restart app, verify new port used

4. **Process Cleanup**:
   - Start service
   - Quit app normally
   - Verify process terminated
   - Kill app process forcefully
   - Verify child process terminated

5. **Abnormal Scenarios**:
   - Start with missing executable
   - Start with corrupted config file
   - Start with read-only config file

**Complexity**: High | **Estimated Time**: 4 hours

**Dependencies**: All implementation tasks

---

### Task 5.5: Performance Testing

**Metrics to Measure**:
- App startup time (with port check)
- Service startup time (phase transitions)
- Config file sync time
- Memory usage during startup
- Process cleanup time

**Benchmark Targets**:
- App startup: <700ms (vs ~600ms target)
- Service startup: <6s (no change from current)
- Config sync: <100ms
- Memory increase: <10MB

**Complexity**: Medium | **Estimated Time**: 2 hours

**Dependencies**: All implementation tasks

---

## Task Dependency Graph

```
Phase 1: Process Lifecycle
├── Task 1.1 (getSpawnOptions)
│   └── Task 1.2 (before-quit) ──┐
│   └── Task 1.3 (forceKill) ────┤
│                               │
Phase 2: Port Detection          │
├── Task 2.1 (public checkPort)  │
│   └── Task 2.2 (IPC handler) ──┼──┐
│   └── Task 2.4 (init check) ───┤  │
│                               │  │
├── Task 2.3 (Redux state) ─────┘  │
│   └── Task 2.5 (UI warning) ─────┤
│                                  │
Phase 3: Config Sync               │
├── Task 3.1 (config path)        │
│   └── Task 3.2 (sync to file) ───┼──┐
│       └── Task 3.3 (updateConfig)│  │
│           └── Task 3.4 (IPC) ────┘  │
│                                  │
Phase 4: Status Feedback           │
├── Task 4.1 (phase enum)          │
│   └── Task 4.2 (emit helper) ─────┼──┐
│       └── Task 4.3 (listening) ──┤  │
│           └── Task 4.4 (integrate)│  │
│                                  │  │
├── Task 4.5 (Redux phase) ────────┘  │
│   └── Task 4.6 (IPC listener) ──────┤
│       └── Task 4.7 (UI progress) ───┘
│
Phase 5: Testing
├── Task 5.1 (unit: process) ────┐
├── Task 5.2 (unit: port) ───────┤
├── Task 5.3 (integration) ───────┼──► Validation
├── Task 5.4 (manual: all platforms)┤
└── Task 5.5 (performance) ────────┘
```

## Parallelization Opportunities

**Can be done in parallel**:
- Phase 1, 2, 3 are independent (no cross-dependencies)
- Task 1.2 and Task 1.3 can be done simultaneously (both depend on 1.1)
- Task 2.3 and Task 2.4 can be done in parallel
- Task 3.5 and 3.6 can be done in parallel (port persistence methods)
- Task 5.1, 5.2, 5.5 can be done in parallel

**Must be sequential**:
- Phase 4 requires Phases 1-2 complete
- Task 3.2 depends on Task 3.5 (saveLastSuccessfulPort)
- Task 3.7 depends on Task 3.5 and 3.6 (load and save methods)
- Task 3.8 depends on Task 3.6 and 3.7 (save after start)
- Task 3.9 depends on Task 3.5 and 3.6 (migration)
- Task 3.10 depends on Task 3.9 (init migration)
- Task 4.4 must be after 4.2 and 4.3
- Phase 5 requires all implementation complete

## Summary

**Total Tasks**: 30 (added 6 tasks: 4 port persistence + 2 migration)
**Total Estimated Time**: 36-42 hours (increased for migration tasks)

**Critical Path**:
1. Task 1.1 → 1.3 → 5.1 (Process lifecycle)
2. Task 2.1 → 2.2 → 2.4 → 5.2 (Port detection)
3. Task 3.5 → 3.6 → 3.9 → 3.10 → 3.7 → 3.8 → 5.1 (Port persistence + migration)
4. Task 4.1 → 4.2 → 4.3 → 4.4 → 4.7 → 5.3 (Status feedback)

**Quick Wins** (can be done first):
- Task 2.1 (5 minutes) - Public method
- Task 2.3 (30 minutes) - Redux state
- Task 4.1 (15 minutes) - Type definition
- Task 3.5 (30 minutes) - Load saved port
- Task 3.6 (30 minutes) - Save port method

**High Impact** (user-visible):
- Task 2.5 (45 minutes) - Port warning UI
- Task 4.7 (1.5 hours) - Phase progress UI
- Task 3.4 (30 minutes) - Config change IPC
- Task 3.7 (1 hour) - Port auto-recovery on startup
- Task 3.9 (45 minutes) - Config migration for upgrade path

**Risk Mitigation**:
- Task 5.4 (4 hours) - Cross-platform testing is critical
- Task 3.2 (1.5 hours) - Config file sync needs robust error handling
- Task 1.3 (1 hour) - Process group killing needs testing
- Task 3.7 (1 hour) - Port loading logic needs availability validation
- Task 3.9 (45 minutes) - Migration logic needs testing with legacy configs
