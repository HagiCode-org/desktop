# Windows BAT 脚本静默执行 - Electron App Spec Delta

## MODIFIED Requirements

### Requirement: Windows Platform Process Execution

The system SHALL execute BAT scripts and other child processes on Windows without displaying console windows to the user, while maintaining full process control and output capture capabilities.

#### Scenario: Silent dependency installation on Windows

- **WHEN** the application installs a system dependency (e.g., .NET 8.0 Runtime) on Windows
- **THEN** the installation process SHALL execute without displaying a console window
- **AND** the process stdout and stderr SHALL be captured and logged to electron-log
- **AND** the application SHALL maintain full control over the child process lifecycle (start, stop, restart)

#### Scenario: Silent web service startup on Windows

- **WHEN** the application starts the embedded web service on Windows
- **THEN** the startup process SHALL execute without displaying a console window
- **AND** the process exit code and output SHALL be captured for status monitoring
- **AND** the application SHALL be able to monitor and restart the service as needed

#### Scenario: Cross-platform spawn option consistency

- **WHEN** spawning child processes on any platform (Windows, macOS, Linux)
- **THEN** the system SHALL apply platform-specific spawn options consistently
- **AND** Windows processes SHALL include `windowsHide: true` to prevent console windows
- **AND** Unix processes SHALL maintain existing behavior (execute permissions, default options)
- **AND** all processes SHALL use `stdio: ['pipe', 'pipe', 'pipe']` for output capture

## ADDED Requirements

### Requirement: Process Output Visibility

The system SHALL provide visibility into child process execution through logging and optional IPC communication, ensuring users can monitor progress without console windows.

#### Scenario: Process output logging

- **WHEN** a child process generates stdout or stderr output
- **THEN** the output SHALL be logged to electron-log with appropriate log levels (info for stdout, error for stderr)
- **AND** the log entries SHALL include timestamps and source identifiers
- **AND** multi-line output SHALL be preserved and formatted correctly

#### Scenario: Optional IPC progress reporting

- **WHEN** a child process execution is initiated from a renderer process request
- **THEN** the main process MAY send progress updates via IPC events
- **AND** the IPC events SHALL include output type (stdout/stderr), data content, and timestamp
- **AND** the IPC communication SHALL be optional and not required for core functionality

#### Scenario: Process error handling without console

- **WHEN** a child process fails or exits with an error code
- **THEN** the error SHALL be logged to electron-log with full context
- **AND** the renderer process SHALL receive error notification via IPC
- **AND** the error message SHALL include the exit code and relevant error output
- **AND** no console window SHALL be displayed to the user during error handling
