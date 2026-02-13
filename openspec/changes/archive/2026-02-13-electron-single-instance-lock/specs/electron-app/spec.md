## ADDED Requirements

### Requirement: Single Instance Lock

The application SHALL enforce single instance locking to prevent multiple application instances from running simultaneously. When a user attempts to launch a second instance, the application SHALL focus the existing instance's main window instead of creating a new one.

#### Scenario: User attempts to launch second instance on Windows

**Given** Hagicode Desktop is already running on Windows
**When** User attempts to launch a second instance
**Then** The second instance exits immediately without creating a new window
**And** The existing instance's main window is restored if minimized
**And** The existing instance's main window is brought to foreground and focused
**And** Only one system tray icon is visible

#### Scenario: User attempts to launch second instance on macOS

**Given** Hagicode Desktop is already running on macOS
**When** User attempts to launch a second instance
**Then** The second instance exits immediately without creating a new window
**And** The existing instance's main window is restored if minimized
**And** The existing instance's main window is brought to foreground and focused
**And** Only one menu bar icon is visible

#### Scenario: User attempts to launch second instance on Linux

**Given** Hagicode Desktop is already running on Linux
**When** User attempts to launch a second instance
**Then** The second instance exits immediately without creating a new window
**And** The existing instance's main window is restored if minimized
**And** The existing instance's main window is brought to foreground and focused
**And** Only one system tray icon is visible

#### Scenario: Embedded web service port conflict prevention

**Given** Hagicode Desktop is running with embedded web service on port 5000
**When** User attempts to launch a second instance
**Then** The second instance exits before attempting to bind port 5000
**And** The existing instance's web service continues running normally
**And** No port conflict error occurs

#### Scenario: Application first launch after system restart

**Given** No Hagicode Desktop instance is currently running
**When** User launches Hagicode Desktop
**Then** The application successfully acquires single instance lock
**And** The application initializes normally
**And** Main window is created and displayed
**And** System tray/menu bar icon is created
