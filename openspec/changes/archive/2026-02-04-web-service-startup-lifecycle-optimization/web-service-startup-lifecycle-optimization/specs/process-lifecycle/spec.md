# Process Lifecycle Management

## ADDED Requirements

### Requirement: Port availability MUST be checked at application initialization

The application MUST check if the configured web service port is available during startup, before the user interacts with the service, enabling early error detection and user feedback.

#### Scenario: Port available at startup

**Given** the application is starting
**And** the configured port (e.g., 5000) is available
**When** the initialization completes
**Then** the port check should return `available: true`
**And** the result should be emitted to the renderer process
**And** the UI should not display any port conflict warnings

#### Scenario: Port occupied at startup

**Given** the application is starting
**And** the configured port is already in use by another process
**When** the initialization completes
**Then** the port check should return `available: false`
**And** the result should be emitted to the renderer process
**And** the UI should display a port conflict warning

### Requirement: Port check method MUST be publicly accessible

The `checkPortAvailable()` method MUST be changed from private to public to allow calling from the main process during initialization.

#### Scenario: Public method access

**Given** the web service manager is initialized
**When** `checkPortAvailable()` is called from main.ts
**Then** the method should execute without visibility errors
**And** it should return a Promise resolving to boolean

## MODIFIED Requirements

### Requirement: Startup process MUST emit granular phase updates

The web service startup process MUST emit distinct phase updates to the renderer process, providing users with clear feedback about startup progress.

#### Scenario: Successful startup with all phases

**Given** the web service is stopped
**When** the user starts the service
**Then** the following phases should be emitted in order:
  - `checking_port` with message "Checking port availability..."
  - `spawning` with message "Starting service process..."
  - `waiting_listening` with message "Waiting for service to start listening..."
  - `health_check` with message "Performing health check..."
  - `running` with message "Service is running"
**And** each phase should include a timestamp
**And** the UI should update to reflect the current phase

#### Scenario: Startup failure during port check

**Given** the web service is stopped
**And** the configured port is in use
**When** the user starts the service
**Then** the `checking_port` phase should be emitted
**Then** an `error` phase should be emitted with reason "port_in_use"
**And** the status should change to `'error'`
**And** the process should remain stopped

#### Scenario: Startup failure during spawn

**Given** the web service is stopped
**And** the executable file is missing
**When** the user starts the service
**Then** the `checking_port` phase should complete
**Then** the `spawning` phase should be emitted
**Then** an `error` phase should be emitted with reason "executable_not_found"
**And** the status should change to `'error'`

### Requirement: Process MUST wait for port listening before health check

The startup process MUST include an intermediate phase that waits for the service to begin listening on its port before attempting the HTTP health check.

#### Scenario: Port listening detected successfully

**Given** the service process has been spawned
**When** `waitForPortListening()` is called
**Then** it should attempt to connect to the configured port and host
**And** if connection succeeds within 10 seconds, it should return `true`
**And** the `waiting_listening` phase should be emitted
**And** the process should proceed to health check

#### Scenario: Port listening timeout

**Given** the service process has been spawned
**And** the process is not accepting connections
**When** `waitForPortListening()` is called
**Then** it should retry connection attempts every 500ms
**And** after 10 seconds without success, it should return `false`
**And** an `error` phase should be emitted with reason "listening_timeout"
**And** the process should be stopped
**And** the status should change to `'error'`

## REMOVED Requirements

### Requirement: Direct health check after spawn

The current implementation that immediately performs health checks after spawning the process is removed in favor of the two-phase approach (listening check → health check).

**Rationale**: Direct health checks can fail or timeout when the service is still initializing. The intermediate listening check provides better error detection and user feedback.
