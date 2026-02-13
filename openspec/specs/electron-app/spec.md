# electron-app Specification

## Purpose
TBD - created by archiving change electron-desktop-app-dml-architecture. Update Purpose after archive.
## Requirements
### Requirement: Cross-platform Desktop Client

Hagicode Desktop MUST provide native desktop clients on Windows, macOS, and Linux platforms as a local management and monitoring tool for Hagicode Server. The application window MUST launch in maximized state to utilize the full screen area.

#### Scenario: 用户在 Windows 平台安装应用

**Given** 用户使用 Windows 10 或更高版本
**When** 用户下载并运行 Hagicode Desktop 安装包（NSIS 或 AppX）
**Then** 应用成功安装到系统
**And** 开始菜单出现 Hagicode Desktop 快捷方式
**And** 系统托盘出现应用图标
**And** 应用启动时窗口以最大化状态显示
**And** 应用启动时不显示开发控制台（DevTools）

#### Scenario: 用户在 macOS 平台安装应用

**Given** 用户使用 macOS 11 或更高版本
**When** 用户下载并打开 DMG 安装包
**Then** 应用拖拽到 Applications 文件夹后成功安装
**And** Launchpad 中出现 Hagicode Desktop 应用图标
**And** 菜单栏出现应用图标（macOS 菜单栏集成）
**And** 应用启动时窗口以最大化状态显示（全屏模式或绿色按钮最大化）
**And** 应用启动时不显示开发控制台（DevTools）

#### Scenario: 用户在 Linux 平台安装应用

**Given** 用户使用 Linux 发行版（Ubuntu、Fedora 等）
**When** 用户下载并运行 AppImage 或 deb 包
**Then** 应用成功安装或直接运行
**And** 应用菜单中出现 Hagicode Desktop 条目
**And** 系统托盘（如果支持）出现应用图标
**And** 应用启动时窗口以最大化状态显示
**And** 应用启动时不显示开发控制台（DevTools）

#### Scenario: 打包应用成功启动

**Given** 用户已安装 Hagicode Desktop 打包版本
**When** 用户启动应用
**Then** 应用正确加载渲染进程界面
**And** 控制台无 "Not allowed to load local resource" 错误
**And** 主窗口以最大化状态正常显示应用内容
**And** 开发控制台（DevTools）不自动打开

#### Scenario: 窗口最大化启动和调整

**Given** 用户已安装 Hagicode Desktop
**When** 用户启动应用
**Then** 应用窗口以最大化状态启动
**And** 用户可以点击还原按钮恢复正常窗口尺寸
**And** 用户可以手动调整窗口大小
**And** 窗口不能缩小到小于最小尺寸（800x600）

#### Scenario: 开发模式下 DevTools 可用

**Given** 开发者使用 `npm run dev` 启动应用
**When** 应用启动
**Then** 开发控制台（DevTools）自动打开
**And** 应用连接到开发服务器（http://localhost:36598）
**And** 开发者可以调试应用

---

### Requirement: System Tray Integration

The application MUST provide a persistent icon in the OS notification area (Windows) / menu bar (macOS) / system tray (Linux) to allow users quick access to application features.

#### Scenario: Windows 系统托盘显示和交互

**Given** 应用正在运行
**When** 查看任务栏右下角通知区域
**Then** 显示 Hagicode Desktop 托盘图标
**And** 右键点击图标显示上下文菜单
**And** 菜单包含 "显示窗口" 和 "退出" 选项
**And** 托盘图标根据服务器状态变化（运行中/已停止）

#### Scenario: 通过托盘显示主窗口

**Given** 主窗口已隐藏或最小化
**When** 用户右键点击托盘图标并选择 "显示窗口"
**Then** 主窗口恢复显示并置于前台
**And** 窗口保持之前的尺寸和位置

#### Scenario: 通过托盘退出应用

**Given** 应用正在运行
**When** 用户右键点击托盘图标并选择 "退出"
**Then** 应用完全退出
**And** 托盘图标消失
**And** 系统资源被释放

---

### Requirement: Server Status Monitoring

The application MUST connect to a local or remote Hagicode Server, query its running status in real-time, and display it in the main window and system tray.

#### Scenario: 查询服务器运行状态

**Given** Hagicode Server 已安装并运行
**When** 应用启动或用户手动刷新
**Then** 应用通过 HTTP API 查询服务器状态
**And** 状态结果在 3 秒内返回
**And** 主窗口显示服务器状态（运行中/已停止/错误）

#### Scenario: 托盘图标反映服务器状态

**Given** 应用正在运行并已连接到服务器
**When** 服务器状态发生变化（如从运行中变为已停止）
**Then** 系统托盘图标在 3 秒内更新
**And** 鼠标悬停在托盘图标上显示当前状态
**And** 图标样式或颜色根据状态变化

#### Scenario: 服务器状态更新轮询

**Given** 应用正在运行
**When** 应用已连接到 Hagicode Server
**Then** 应用每隔 30 秒自动查询服务器状态
**And** 状态变化时通知渲染进程更新 UI
**And** 轮询在应用退出或用户禁用时停止

---

### Requirement: Server Control

The application MUST allow users to control Hagicode Server start, stop, and restart operations through the main window.

#### Scenario: 启动 Hagicode Server

**Given** Hagicode Server 已安装但当前未运行
**When** 用户在主窗口点击 "启动服务器" 按钮
**Then** 应用向服务器发送启动请求
**And** 显示加载状态指示器
**And** 服务器在 5 秒内开始启动
**And** 应用显示 "服务器正在启动" 通知
**And** 状态更新为 "启动中" 然后变为 "运行中"

#### Scenario: 停止 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在主窗口点击 "停止服务器" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后向服务器发送停止请求
**And** 应用显示 "服务器正在停止" 通知
**And** 状态更新为 "已停止"

#### Scenario: 重启 Hagicode Server

**Given** Hagicode Server 正在运行
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

---

### Requirement: Server Connection Configuration

The application MUST allow users to configure the connection address, port, and other communication parameters for Hagicode Server.

#### Scenario: 配置服务器连接地址

**Given** 用户首次启动应用
**When** 用户打开配置界面
**Then** 显示默认连接地址（如 http://localhost:8080）
**And** 用户可以修改服务器地址和端口
**And** 用户点击 "保存" 后配置持久化存储

#### Scenario: 测试服务器连接

**Given** 用户在配置界面输入了新的服务器地址
**When** 用户点击 "测试连接" 按钮
**Then** 应用向指定地址发送测试请求
**And** 在 3 秒内显示连接结果（成功/失败）
**And** 成功时显示服务器版本信息

#### Scenario: 使用保存的配置连接

**Given** 用户已保存服务器配置
**When** 应用下次启动
**Then** 自动加载保存的配置
**And** 尝试连接到配置的服务器地址
**And** 连接成功后显示服务器状态

---

### Requirement: Auto-update Support

The application MUST be able to detect, download, and install new versions, providing a seamless update experience.

#### Scenario: 检查可用更新

**Given** 应用正在运行
**When** 应用启动或用户手动检查更新
**Then** 应用向 GitHub Releases 查询最新版本
**And** 如果发现新版本，显示更新通知
**And** 通知包含新版本号和更新说明

#### Scenario: 下载和安装更新

**Given** 有可用更新且用户同意更新
**When** 用户点击 "立即更新" 按钮
**Then** 应用在后台下载更新包
**And** 显示下载进度条
**And** 下载完成后提示用户重启应用
**And** 用户确认后应用安装更新并重启

#### Scenario: 自动更新在后台进行

**Given** 应用检测到有可用更新
**When** 用户选择 "稍后提醒"
**Then** 更新包在后台下载
**And** 下载完成后系统托盘显示 "更新可用" 提示
**And** 用户可随时选择安装更新

---

### Requirement: Automated Build and Release

The application MUST provide installation packages for all platforms through GitHub Actions automated builds and publish them to GitHub Releases.

#### Scenario: 自动化构建 Windows 安装包

**Given** 开发者推送版本标签（如 v1.0.0）到 GitHub
**When** GitHub Actions 工作流触发
**Then** 自动构建 Windows 安装包（NSIS、AppX、Portable）
**And** 构建产物上传为 GitHub Actions artifacts
**And** 如果是标签推送，发布到 GitHub Releases

#### Scenario: 自动化构建 macOS 安装包

**Given** 开发者推送版本标签到 GitHub
**When** macOS 构建任务运行
**Then** 自动构建 macOS 安装包（DMG、ZIP）
**And** 签名和公证（如果配置了证书）
**And** 发布到 GitHub Releases

#### Scenario: 自动化构建 Linux 安装包

**Given** 开发者推送版本标签到 GitHub
**When** Linux 构建任务运行
**Then** 自动构建 Linux 安装包（AppImage、deb、tar.gz）
**And** 发布到 GitHub Releases

---

### Requirement: Single Instance Lock

The application SHALL enforce single instance locking to prevent multiple application instances from running simultaneously. When a user attempts to launch a second instance, application SHALL focus existing instance's main window instead of creating a new one.

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

---

