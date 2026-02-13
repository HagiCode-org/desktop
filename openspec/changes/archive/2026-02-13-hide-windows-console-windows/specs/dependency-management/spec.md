# Dependency Management Spec Delta

## MODIFIED Requirements

### Requirement: Entry Point Script Execution
The system SHALL execute entry point scripts (check, install, start) in a way that maintains a professional user experience across all platforms. On Windows, this includes hiding console windows that would otherwise disrupt the user's workflow.

#### Scenario: Execute check script on Windows
- **WHEN** the system executes an entry point check script on Windows platform
- **THEN** the script runs in background without showing a console window
- **AND** the `windowsHide: true` option is set in spawn options

#### Scenario: Execute install script on Windows
- **WHEN** the system executes an entry point install script on Windows platform
- **THEN** the script runs in background without showing a console window
- **AND** the `windowsHide: true` option is set in spawn options

#### Scenario: Execute start script on Windows
- **WHEN** the web service manager executes the start script on Windows platform
- **THEN** the service starts without showing a console window
- **AND** the `windowsHide: true` option is set in spawn options

#### Scenario: Cross-platform consistency
- **WHEN** entry point scripts are executed on any platform
- **THEN** the user experience is consistent (no visual interruptions)
- **AND** macOS/Linux behavior remains unchanged

## ADDED Requirements

### Requirement: Windows Console Window Suppression
The system SHALL suppress Windows console windows during batch script execution by consistently applying the `windowsHide: true` option to all `child_process.spawn` calls on Windows platform.

#### Scenario: Spawn child process on Windows
- **WHEN** spawning any child process on Windows platform
- **THEN** the spawn options include `windowsHide: true`
- **AND** the console window is hidden from view
- **AND** script execution proceeds normally in background

#### Scenario: Spawn with existing options
- **WHEN** spawning a child process with existing options like `detached`
- **THEN** `windowsHide: true` is combined with existing options
- **AND** all options are applied correctly
