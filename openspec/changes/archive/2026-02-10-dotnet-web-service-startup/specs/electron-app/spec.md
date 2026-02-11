## MODIFIED Requirements

### Requirement: Embedded Web Service Management

The application MUST manage an embedded .NET-based web service (Hagicode Server) that runs locally as a child process. The web service MUST be started using the `dotnet` command to ensure cross-platform consistency.

#### Scenario: Starting embedded web service with dotnet command

**Given** the embedded web service files are present in the installation directory
**When** the user requests to start the web service
**Then** the application MUST spawn a process using `dotnet PCode.Web.dll` command
**And** this command MUST be used consistently on Windows, macOS, and Linux platforms
**And** the service MUST start within 30 seconds
**And** the application MUST display the service status as "running"

#### Scenario: Dotnet command execution on Windows

**Given** the application is running on Windows
**When** the web service needs to start
**Then** the application MUST execute `dotnet PCode.Web.dll` with appropriate working directory
**And** the process MUST be spawned with detached option for independent execution
**And** process output MUST be logged for debugging

#### Scenario: Dotnet command execution on macOS

**Given** the application is running on macOS
**When** the web service needs to start
**Then** the application MUST execute `dotnet PCode.Web.dll` with appropriate working directory
**And** the process MUST be spawned with stdio set to 'ignore'
**And** process lifecycle MUST be managed by the parent application

#### Scenario: Dotnet command execution on Linux

**Given** the application is running on Linux
**When** the web service needs to start
**Then** the application MUST execute `dotnet PCode.Web.dll` with appropriate working directory
**And** the process MUST NOT use shell scripts (start.sh) for startup
**And** process lifecycle MUST be managed by the parent application
**And** stdio MUST be set to 'ignore'

#### Scenario: Web service DLL path resolution

**Given** the active version is installed
**When** resolving the web service executable path
**Then** the application MUST return the path to `PCode.Web.dll` on all platforms
**And** the path MUST be within the active version installation directory
**And** fallback to legacy installation path if active version is not set

#### Scenario: Handling dotnet command failures

**Given** the dotnet command is used to start the web service
**When** the dotnet process fails to start
**Then** the application MUST log the error with details
**And** the service status MUST be set to "error"
**And** an appropriate error message MUST be displayed to the user
**And** the error message MUST indicate that the dotnet command failed
