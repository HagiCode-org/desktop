# User Interface Enhancements

## ADDED Requirements

### Requirement: Port status must be displayed in web service card

The Web Service Status Card component must display a warning when the configured port is unavailable, alerting users before they attempt to start the service.

#### Scenario: Display port conflict warning

**Given** the application has completed initialization
**And** the port status check returned `available: false`
**When** the Web Service Status Card renders
**Then** it should display an alert component with warning styling
**And** the alert should include an icon indicating a problem
**And** the alert title should be "Port Conflict"
**And** the alert description should state "Port {port} is already in use. The web service may fail to start."
**And** the alert should suggest stopping the conflicting application or changing the port

#### Scenario: No warning when port available

**Given** the application has completed initialization
**And** the port status check returned `available: true`
**When** the Web Service Status Card renders
**Then** it should NOT display any port conflict warning
**And** the card should show normal service status

#### Scenario: Port status not yet checked

**Given** the application is still initializing
**And** the port status has not been checked yet
**When** the Web Service Status Card renders
**Then** it should NOT display a port conflict warning
**And** it should show a loading indicator if appropriate

### Requirement: Startup progress must be displayed with visual feedback

The Web Service Status Card must display granular progress indicators during service startup, showing the current phase and providing visual cues about progress.

#### Scenario: Display startup progress

**Given** the web service status is `'starting'`
**And** a startup phase is active
**When** the Web Service Status Card renders
**Then** it should display a loading spinner icon
**And** it should display phase-appropriate text:
  - "Checking Port..." for `checking_port` phase
  - "Starting Process..." for `spawning` phase
  - "Waiting for Service..." for `waiting_listening` phase
  - "Checking Health..." for `health_check` phase
**And** it should display the phase message below the phase text
**And** it should display a progress bar with phase-appropriate values:
  - 20% for `checking_port`
  - 40% for `spawning`
  - 60% for `waiting_listening`
  - 80% for `health_check`
  - 100% for `running`

#### Scenario: Progress completes on success

**Given** the service is starting
**When** the `running` phase is reached
**Then** the progress indicator should be hidden
**And** the card should display the normal running state
**And** the progress bar should be removed

#### Scenario: Progress shows error on failure

**Given** the service is starting
**When** an `error` phase is emitted
**Then** the progress indicator should be hidden
**And** the card should display an error state
**And** an error message should be shown indicating the failure reason

### Requirement: Redux store must track port availability

The Redux store must include fields for port availability status to enable reactive UI updates.

#### Scenario: Initial port availability state

**Given** the application is starting
**And** no port check has been performed
**When** the web service state is initialized
**Then** `portAvailable` should be `true` (default)
**And** `portStatusChecked` should be `false`

#### Scenario: Port availability update

**Given** the application receives a port status event
**When** the port status reducer processes the event
**Then** `portAvailable` should be updated to match the event data
**And** `portStatusChecked` should be set to `true`
**And** components subscribed to the state should re-render

### Requirement: Redux store must track startup phase

The Redux store must include the current startup phase and phase message to enable phase-aware UI rendering.

#### Scenario: Initial phase state

**Given** the application is starting
**When** the web service state is initialized
**Then** `phase` should be `StartupPhase.Idle`
**And** `phaseMessage` should be `null`

#### Scenario: Phase update during startup

**Given** the service is starting
**When** a startup phase event is received
**Then** `phase` should be updated to the new phase value
**And** `phaseMessage` should be updated to the message from the event
**And** components should re-render with new phase information

#### Scenario: Phase reset on service stop

**Given** the service was running
**When** the service is stopped
**Then** `phase` should be reset to `StartupPhase.Idle`
**And** `phaseMessage` should be reset to `null`

### Requirement: Renderer must listen for phase events

The renderer process must establish an IPC listener for startup phase events and dispatch corresponding Redux actions.

#### Scenario: Listen for phase events

**Given** the renderer process is initialized
**When** the component mounts
**Then** it should register a listener for `web-service-startup-phase` events
**And** when an event is received, it should dispatch `updateStartupPhase` action
**And** the listener should be cleaned up when the component unmounts

#### Scenario: Phase event data structure

**Given** the main process emits a phase event
**When** the renderer receives the event
**Then** the event data should include:
  - `phase`: StartupPhase enum value
  - `message`: optional string with phase description
  - `timestamp`: number (milliseconds since epoch)
**And** the Redux action should be dispatched with this data

## MODIFIED Requirements

### Requirement: ProcessInfo interface MUST include phase information

The `ProcessInfo` interface MUST be extended to include startup phase data for status queries.

#### Scenario: Get status includes phase

**Given** the web service is starting
**When** `getStatus()` is called
**Then** the returned `ProcessInfo` object should include:
  - All existing fields (status, pid, uptime, startTime, url, restartCount)
  - `phase`: current StartupPhase
  - `phaseMessage`: optional message string
**And** the phase should reflect the current startup phase

#### Scenario: Phase when service is running

**Given** the web service is in `running` status
**When** `getStatus()` is called
**Then** `phase` should be `StartupPhase.Running`
**And** `phaseMessage` may be `null` or contain a status message

#### Scenario: Phase when service is stopped

**Given** the web service is in `stopped` status
**When** `getStatus()` is called
**Then** `phase` should be `StartupPhase.Idle`
**And** `phaseMessage` should be `null`

### Requirement: Web Service Status Card MUST handle phase-based rendering

The component logic MUST be enhanced to render different UI states based on the current startup phase.

#### Scenario: Determine when to show progress

**Given** the web service state is available
**When** the component renders
**Then** it should show the progress indicator when `status === 'starting'` AND `phase !== StartupPhase.Idle`
**And** it should hide the progress indicator when `status === 'running'` OR `status === 'stopped'`

#### Scenario: Accessibility of phase updates

**Given** the service is starting
**When** each phase transition occurs
**Then** the phase text should be accessible to screen readers
**And** phase changes should be announced appropriately
**And** the progress bar should have an accessible label

## ADDED Requirements

### Requirement: IPC handler MUST provide port status on demand

The main process MUST expose an IPC handler that allows the renderer to request port availability checks at any time.

#### Scenario: Manual port status check

**Given** the application is running
**When** the renderer invokes `check-web-service-port` IPC handler
**Then** the main process should call `checkPortAvailable()`
**And** it should return an object with:
  - `port`: number (the configured port)
  - `available`: boolean
  - `error`: string or null
**And** the renderer should be able to trigger this check on-demand

#### Scenario: Port check when manager not initialized

**Given** the web service manager has not been initialized
**When** the renderer invokes `check-web-service-port` IPC handler
**Then** the handler should return an error response
**And** `available` should be `false`
**And** `error` should contain "Web service manager not initialized"
