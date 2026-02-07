## MODIFIED Requirements

### Requirement: Cross-platform Desktop Client

Hagicode Desktop MUST provide native desktop clients on Windows, macOS, and Linux platforms as a local management and monitoring tool for Hagicode Server. The production build MUST NOT automatically open DevTools, and MUST correctly load the renderer process from the packaged asar archive.

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
**And** 主窗口正常显示应用内容
**And** 开发控制台（DevTools）不自动打开

#### Scenario: 开发模式下 DevTools 可用

**Given** 开发者使用 `npm run dev` 启动应用
**When** 应用启动
**Then** 开发控制台（DevTools）自动打开
**And** 应用连接到开发服务器（http://localhost:36598）
**And** 开发者可以调试应用

---

## ADDED Requirements

### Requirement: Production Build Security Configuration

The production build of Hagicode Desktop MUST follow Electron security best practices, including proper DevTools configuration and secure resource loading from asar archives.

#### Scenario: 生产环境禁用自动 DevTools

**Given** 应用以生产模式构建
**When** 主窗口创建完成
**Then** 不调用 `webContents.openDevTools()`
**And** 开发控制台保持关闭状态

#### Scenario: 安全的 asar 资源加载

**Given** 应用资源打包为 app.asar
**When** 主进程尝试加载渲染进程
**Then** 使用正确的 `loadFile` 方法
**And** 路径正确解析到 asar 内的资源
**And** 不触发跨域或安全策略错误
