# electron-app Specification Delta

## MODIFIED Requirements

### Requirement: Cross-platform Desktop Client

Hagicode Desktop MUST provide native desktop clients on Windows, macOS, and Linux platforms as a local management and monitoring tool for Hagicode Server. The application MUST start with a maximized window by default to provide maximum working area for users, while maintaining the ability to manually resize the window.

#### Scenario: 用户在 Windows 平台安装应用

**Given** 用户使用 Windows 10 或更高版本
**When** 用户下载并运行 Hagicode Desktop 安装包（NSIS 或 AppX）
**Then** 应用成功安装到系统
**And** 开始菜单出现 Hagicode Desktop 快捷方式
**And** 系统托盘出现应用图标
**And** 应用启动时不显示开发控制台（DevTools）

#### Scenario: 用户在 macOS 平台安装应用

**Given** 用户使用 macOS 11 或更高版本
**When** 用户下载并打开 DMG 安装包
**Then** 应用拖拽到 Applications 文件夹后成功安装
**And** Launchpad 中出现 Hagicode Desktop 应用图标
**And** 菜单栏出现应用图标（macOS 菜单栏集成）
**And** 应用启动时不显示开发控制台（DevTools）

#### Scenario: 用户在 Linux 平台安装应用

**Given** 用户使用 Linux 发行版（Ubuntu、Fedora 等）
**When** 用户下载并运行 AppImage 或 deb 包
**Then** 应用成功安装或直接运行
**And** 应用菜单中出现 Hagicode Desktop 条目
**And** 系统托盘（如果支持）出现应用图标
**And** 应用启动时不显示开发控制台（DevTools）

#### Scenario: 打包应用成功启动

**Given** 用户已安装 Hagicode Desktop 打包版本
**When** 用户启动应用
**Then** 应用正确加载渲染进程界面
**And** 控制台无 "Not allowed to load local resource" 错误
**And** 主窗口以最大化状态显示应用内容
**And** 开发控制台（DevTools）不自动打开

#### Scenario: 开发模式下 DevTools 可用

**Given** 开发者使用 `npm run dev` 启动应用
**When** 应用启动
**Then** 开发控制台（DevTools）自动打开
**And** 应用连接到开发服务器（http://localhost:36598）
**And** 开发者可以调试应用
**And** 主窗口以最大化状态显示

#### Scenario: 应用启动时窗口最大化

**Given** 用户启动 Hagicode Desktop 应用
**When** 主窗口创建完成并准备显示
**Then** 窗口自动最大化以填满可用屏幕空间
**And** 用户立即获得最大的工作区域
**And** 窗口无法缩小到小于 800x600 像素

#### Scenario: 用户可以调整最大化后的窗口

**Given** 应用启动后窗口处于最大化状态
**When** 用户点击窗口的还原按钮或手动调整窗口大小
**Then** 窗口恢复正常尺寸或按用户调整的尺寸显示
**And** 用户可以自由调整窗口大小
**And** 窗口保持最小尺寸约束（800x600）

---
