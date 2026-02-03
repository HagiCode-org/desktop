# electron-app Specification Delta

## ADDED Requirements

### Requirement: Platform-Aware Package Version Filtering

The system SHALL filter available package versions based on the current operating system platform before presenting them to the user in the version selection dropdown.

#### Scenario: Filter versions by platform on Linux

**Given** the user is running the application on a Linux system
**And** the available versions include packages for multiple platforms: `["1.0.0-linux-x64", "1.0.0-win-x64", "1.0.0-darwin-x64", "1.0.1-linux-x64-no-runtime"]`
**When** the PackageManagementCard component renders
**Then** the version dropdown shall only display versions containing the platform identifier "linux"
**And** versions for other platforms ("win", "darwin") shall be excluded
**And** versions marked as "no runtime" or "no RT" shall be excluded
**And** the version count display shall show "Available versions: 1 found (filtered by platform: linux)"

#### Scenario: Filter versions by platform on Windows

**Given** the user is running the application on a Windows system
**And** the available versions include packages for multiple platforms
**When** the PackageManagementCard component renders
**Then** the version dropdown shall only display versions containing the platform identifier "win"
**And** versions for other platforms shall be excluded
**And** versions marked as "no runtime" shall be excluded

#### Scenario: Filter versions by platform on macOS

**Given** the user is running the application on macOS
**And** the available versions include packages for multiple platforms
**When** the PackageManagementCard component renders
**Then** the version dropdown shall only display versions containing the platform identifier "darwin"
**And** versions for other platforms shall be excluded
**And** versions marked as "no runtime" shall be excluded

#### Scenario: Display all versions when platform is not detected

**Given** the application is still detecting the platform (platform state is null)
**And** the available versions include packages for multiple platforms
**When** the PackageManagementCard component renders
**Then** the version dropdown may display all available versions
**Or** the dropdown may be disabled with a "Detecting platform..." message
**And** the user shall be informed that platform detection is in progress

#### Scenario: Handle empty filtered version list

**Given** the user is running on a specific platform
**And** none of the available versions match the current platform
**When** the PackageManagementCard component renders
**Then** the version dropdown shall be empty or show a "No compatible versions found" message
**And** the version count shall reflect "0 found (filtered by platform: {platform})"
**And** the user shall be informed that there are no compatible packages available

---

### Requirement: Installation-Based Service Start Control

The system SHALL prevent users from attempting to start the web service when the service package is not installed, and shall provide clear guidance to install the package first.

#### Scenario: Display installation prompt when package is not installed

**Given** the web service package is not installed (packageInfo.isInstalled === false)
**And** the web service is currently stopped
**When** the WebServiceStatusCard component renders
**Then** the "Start Service" button shall NOT be displayed
**And** an informational alert shall be displayed
**And** the alert shall contain a message directing the user to install the package first
**And** the alert shall reference the "Package Management" section

#### Scenario: Display start button when package is installed

**Given** the web service package is installed (packageInfo.isInstalled === true)
**And** the web service is currently stopped
**When** the WebServiceStatusCard component renders
**Then** the "Start Service" button shall be displayed
**And** no installation prompt shall be shown
**And** the user can click the button to start the service

#### Scenario: Synchronize UI state after package installation

**Given** the web service package was not installed
**And** the user saw the installation prompt in WebServiceStatusCard
**When** the user installs the package from PackageManagementCard
**And** the installation completes successfully
**Then** the packageInfo.isInstalled state shall update to true
**And** the WebServiceStatusCard shall automatically update to show the "Start Service" button
**And** the installation prompt shall disappear

#### Scenario: Handle package info not yet loaded

**Given** the application has just started
**And** the packageInfo state is null or loading
**When** the WebServiceStatusCard component renders
**Then** the component shall handle the undefined state gracefully
**And** either show a loading state or default to showing the start button
**And** no errors shall be thrown due to missing packageInfo

---

## MODIFIED Requirements

### Requirement: Server Control

The application MUST allow users to control Hagico Server start, stop, and restart operations through the main window, provided the required service package is installed.

#### Scenario: 启动 Hagico Server (with package check)

**Given** Hagico Server package is installed and the service is currently not running
**When** 用户在主窗口点击 "启动服务器" 按钮
**Then** 应用向服务器发送启动请求
**And** 显示加载状态指示器
**And** 服务器在 5 秒内开始启动
**And** 应用显示 "服务器正在启动" 通知
**And** 状态更新为 "启动中" 然后变为 "运行中"

#### Scenario: Attempt to start without package installed (NEW)

**Given** Hagico Server package is NOT installed
**And** the service is currently stopped
**When** 用户查看 WebServiceStatusCard
**Then** "启动服务器" 按钮不可见
**And** 显示提示信息要求用户先安装包
**And** 提示信息引导用户前往 "Package Management" 部分
**And** 用户可以在安装包后返回启动服务

#### Scenario: 停止 Hagico Server

**Given** Hagico Server 正在运行
**When** 用户在主窗口点击 "停止服务器" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后向服务器发送停止请求
**And** 应用显示 "服务器正在停止" 通知
**And** 状态更新为 "已停止"

#### Scenario: 重启 Hagico Server

**Given** Hagico Server 正在运行
**When** 用户在主窗口点击 "重启服务器" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后先停止再启动服务器
**And** 应用显示进度通知
**And** 服务器成功重启后状态更新为 "运行中"

#### Scenario: 服务器控制失败处理

**Given** 用户尝试控制服务器（启动/停止/重启）
**When** 服务器返回错误或无响应
**Then** 应用显示错误消息对话框
**And** 错误消息包含具体失败原因
**And** 应用记录错误日志
**And** 状态显示为 "错误"
