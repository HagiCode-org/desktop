# Configuration Management

## ADDED Requirements

### Requirement: Runtime configuration changes must sync to configuration file

When the web service configuration (port or host) is updated at runtime, the changes must be immediately persisted to the `appsettings.yml` file in the installation directory, ensuring consistency between memory and disk.

#### Scenario: Port change synced to file

**Given** the web service is configured with port 5000
**When** the user updates the configuration to port 5001
**Then** `updateConfig()` should update the in-memory configuration
**And** `syncConfigToFile()` should be called automatically
**And** the `appsettings.yml` file should be updated with `Urls: http://localhost:5001`
**And** the file should remain valid YAML format
**And** other configuration properties should be preserved

#### Scenario: Host change synced to file

**Given** the web service is configured with host "localhost"
**When** the user updates the configuration to host "0.0.0.0"
**Then** `updateConfig()` should update the in-memory configuration
**And** `syncConfigToFile()` should be called automatically
**And** the `appsettings.yml` file should be updated with the new host
**And** the URL should reflect `http://0.0.0.0:5000`

#### Scenario: Non-port config change does not trigger sync

**Given** the web service is configured
**When** the user updates a configuration property other than port or host
**Then** `updateConfig()` should update the in-memory configuration
**And** `syncConfigToFile()` should NOT be called
**And** the `appsettings.yml` file should remain unchanged

### Requirement: Configuration file path must be platform-specific

The application must locate the `appsettings.yml` file using platform-specific paths consistent with the installation structure.

#### Scenario: Config path on Windows

**Given** the application is running on Windows
**When** `getConfigFilePath()` is called
**Then** it should return `{userData}/pcode-web/installed/win-x64/appsettings.yml`

#### Scenario: Config path on macOS

**Given** the application is running on macOS
**When** `getConfigFilePath()` is called
**Then** it should return `{userData}/pcode-web/installed/osx-x64/appsettings.yml`

#### Scenario: Config path on Linux

**Given** the application is running on Linux
**When** `getConfigFilePath()` is called
**Then** it should return `{userData}/pcode-web/installed/linux-x64/appsettings.yml`

### Requirement: Configuration sync must handle file I/O errors gracefully

If the configuration file cannot be written due to permissions, missing file, or other I/O errors, the application should log the error but continue with the in-memory configuration.

#### Scenario: File permission denied

**Given** the configuration file is read-only
**When** `syncConfigToFile()` is called
**Then** it should catch the permission error
**And** it should log the error with context
**And** it should NOT throw the error to the caller
**And** the in-memory configuration should remain valid
**And** the operation should complete without crashing

#### Scenario: Configuration file missing

**Given** the configuration file does not exist
**When** `syncConfigToFile()` is called
**Then** it should catch the file not found error
**And** it should log the error
**And** it should NOT attempt to create the file
**And** the in-memory configuration should remain valid

#### Scenario: YAML parsing error

**Given** the configuration file contains invalid YAML
**When** `syncConfigToFile()` is called
**Then** it should catch the parsing error
**And** it should log the error with details
**And** it should NOT modify the file
**And** the operation should fail gracefully

## MODIFIED Requirements

### Requirement: updateConfig method MUST be async

The `updateConfig()` method signature MUST change from synchronous to asynchronous to support file I/O operations during configuration synchronization.

#### Scenario: Async config update

**Given** the web service manager is initialized
**When** `updateConfig({ port: 5001 })` is called
**Then** it should return a Promise
**And** the Promise should resolve after both memory and file updates complete
**And** the method should be awaitable

### Requirement: IPC handler for config updates MUST support async operations

The IPC handler `set-web-service-config` MUST handle the asynchronous nature of `updateConfig()` and return appropriate success/error responses.

#### Scenario: Successful config update via IPC

**Given** the renderer process sends a config update
**When** the IPC handler processes the request
**Then** it should await the `updateConfig()` call
**And** it should return `{ success: true, error: null }`

#### Scenario: Failed config update via IPC

**Given** the renderer process sends an invalid config update
**When** the IPC handler processes the request
**And** `updateConfig()` throws an error
**Then** the handler should catch the error
**And** it should return `{ success: false, error: "error message" }`
**And** the application should not crash

## ADDED Requirements

### Requirement: Application MUST persist last successfully used port

The application MUST save the port number to a persistent storage location whenever the web service starts successfully, enabling automatic port recovery on subsequent application launches.

#### Scenario: Save port after successful startup

**Given** the web service startup process completes successfully
**And** the health check passes
**When** the service enters `running` state
**Then** the current port number MUST be saved to `userData/config/web-service.json`
**And** the file should contain `{ "lastSuccessfulPort": <port>, "savedAt": "<timestamp>" }`
**And** the save operation should not block startup
**And** the `userData/config/` directory should be created if it doesn't exist

#### Scenario: Port not saved on failed startup

**Given** the web service startup process fails
**When** an error occurs during startup
**Then** the port MUST NOT be saved to persistent storage
**And** any existing saved port should remain unchanged

### Requirement: Application MUST load saved port on initialization

The application MUST attempt to load the previously saved port configuration during initialization and use it if available and valid.

#### Scenario: Load and use saved port

**Given** a saved port configuration exists in `userData/config/web-service.json`
**And** the saved port is different from the default port
**When** the application initializes the web service manager
**Then** the manager SHOULD load the saved port
**And** verify the saved port is available
**And** if available, use the saved port as the initial configuration
**And** log "Using saved port: {port}"

#### Scenario: Fallback to default when saved port unavailable

**Given** a saved port configuration exists
**And** the saved port is currently in use by another application
**When** the application initializes
**Then** the manager SHOULD detect the port is unavailable
**And** fall back to the default port
**And** log "Saved port unavailable, using default: {port}"

#### Scenario: First run without saved port

**Given** no saved port configuration exists
**When** the application initializes
**Then** the manager SHOULD use the default port configuration
**And** continue initialization without errors
**And** log "No saved port configuration found"

### Requirement: Configuration MUST preserve YAML structure

When writing configuration to `appsettings.yml`, the application MUST preserve comments, formatting, and structure where possible.

#### Scenario: Preserving existing config structure

**Given** the `appsettings.yml` contains multiple configuration sections
**When** `syncConfigToFile()` is called
**Then** only the `Urls` field should be modified
**And** other fields should remain unchanged
**And** YAML formatting should be maintained
**And** comments in the file should be preserved

### Requirement: Application MUST migrate legacy configuration to unified location

The application MUST automatically migrate configuration from the legacy location (`userData/web-service-config.json`) to the new unified config directory (`userData/config/web-service.json`) on startup.

#### Scenario: Migrate existing legacy configuration

**Given** a legacy configuration file exists at `userData/web-service-config.json`
**When** the application initializes
**Then** it SHOULD detect the legacy configuration
**And** copy the configuration to `userData/config/web-service.json`
**And** delete the legacy file after successful migration
**And** log "Migrating config from legacy location" and "Config migration completed"

#### Scenario: No migration when config already in new location

**Given** no legacy configuration file exists
**And** a configuration file exists at `userData/config/web-service.json`
**When** the application initializes
**Then** it SHOULD not attempt migration
**And** it SHOULD load configuration from the new location directly
**And** log "No legacy config found, skipping migration"

#### Scenario: No migration on fresh installation

**Given** no legacy configuration file exists
**And** no configuration file exists at the new location
**When** the application initializes
**Then** it SHOULD not attempt migration
**And** it SHOULD continue with default configuration
**And** not log any migration warnings

#### Scenario: Migration failure handling

**Given** a legacy configuration file exists
**And** an error occurs during migration (e.g., permission denied)
**When** the application initializes
**Then** it SHOULD log the migration error
**And** continue with default configuration
**And** not crash or block startup
**And** the legacy file should remain intact for retry on next startup
