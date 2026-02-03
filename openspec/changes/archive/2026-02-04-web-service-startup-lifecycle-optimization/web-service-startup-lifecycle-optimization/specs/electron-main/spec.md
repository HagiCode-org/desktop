# Electron Main Process - Process Lifecycle

## ADDED Requirements

### Requirement: Application MUST cleanup web service processes before exit

The Electron main process MUST ensure all web service child processes are properly terminated before the application exits, preventing orphaned processes from continuing to run after the desktop application is closed.

#### Scenario: Normal application exit

**Given** the web service is running
**When** the user quits the application normally
**Then** the main process should call `cleanup()` on the web service manager
**And** all child processes should terminate gracefully
**And** the application should exit only after cleanup completes

#### Scenario: Abnormal application termination

**Given** the web service is running
**When** the main process is killed or crashes
**Then** the operating system should terminate child processes due to process group binding
**And** no orphan processes should remain running

### Requirement: Web service manager MUST support platform-specific process spawning

The `PCodeWebServiceManager` MUST use different process spawning strategies based on the platform to ensure proper lifecycle management across Windows, Linux, and macOS.

#### Scenario: Process spawning on Linux/macOS

**Given** the application is running on Linux or macOS
**When** the web service manager spawns a new process
**Then** it should set `detached: false` to maintain parent-child relationship
**And** it should set `stdio: 'ignore'` to prevent pipe inheritance issues
**And** the process should be created in a new process group

#### Scenario: Process spawning on Windows

**Given** the application is running on Windows
**When** the web service manager spawns a new process
**Then** it should set `detached: true` to allow independent execution
**And** it should set `windowsHide: true` to hide console windows

## MODIFIED Requirements

### Requirement: Force kill operation MUST handle process groups

The `forceKill()` method MUST use platform-appropriate strategies to terminate processes, ensuring all child processes are cleaned up.

#### Scenario: Force kill on Unix systems

**Given** a web service process is running on Linux or macOS
**When** `forceKill()` is called
**Then** it should attempt to kill the entire process group using negative PID
**And** if group kill fails, it should fall back to killing individual PID
**And** the operation should log all attempts for debugging

#### Scenario: Force kill on Windows

**Given** a web service process is running on Windows
**When** `forceKill()` is called
**Then** it should use `taskkill /F /T /PID` to terminate process tree
**And** the operation should execute with `stdio: 'ignore'`

### Requirement: before-quit event handler MUST perform async cleanup

The existing `before-quit` event handler MUST be enhanced to perform async cleanup of web service processes before allowing the application to exit.

#### Scenario: Before quit with running service

**Given** the web service is running
**When** the application receives a `before-quit` event
**Then** it should prevent default to allow async operations
**And** it should call `webServiceManager.cleanup()` and wait for completion
**And** it should call `destroyTray()` after cleanup
**And** it should call `app.exit(0)` to ensure application quits
**And** errors during cleanup should not prevent application exit

#### Scenario: Before quit with stopped service

**Given** the web service is not running
**When** the application receives a `before-quit` event
**Then** cleanup should complete immediately without errors
**And** the application should exit normally
