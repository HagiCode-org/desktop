# Electron App Spec Delta

## MODIFIED Requirements

### Requirement: Platform-Specific Process Spawning
The Electron main process SHALL spawn child processes with platform-appropriate options. On Windows, this includes the `windowsHide: true` option to prevent console windows from appearing during batch script execution.

#### Scenario: Windows dependency check execution
- **WHEN** DependencyManager executes a dependency check script on Windows
- **THEN** spawn options include `windowsHide: true`
- **AND** no console window appears during execution

#### Scenario: Windows web service startup
- **WHEN** WebServiceManager starts the embedded web service on Windows
- **THEN** spawn options include `windowsHide: true`
- **AND** no console window appears during service startup

#### Scenario: Windows process termination
- **WHEN** using taskkill to forcefully terminate a process on Windows
- **THEN** spawn options include `windowsHide: true`
- **AND** no console window appears during termination

#### Scenario: Unix platform unchanged
- **WHEN** spawning processes on macOS or Linux
- **THEN** existing behavior is preserved
- **AND** no `windowsHide` option is needed (platform-specific)
