# electron-app Specification Delta

## MODIFIED Requirements

### Requirement: Cross-platform Desktop Client

Hagicode Desktop MUST provide native desktop clients on Windows, macOS, and Linux platforms as a local management and monitoring tool for Hagicode Server. The application window MUST launch in maximized state to utilize the full screen area. The application MUST correctly load renderer process content in production builds packaged with asar.

#### Scenario: 用户在 Windows 平台安装应用

**Given** 用户使用 Windows 10 或更高版本
**When** 用户下载并运行 Hagicode Desktop 安装包（NSIS 或 AppX）
**Then** 应用成功安装到系统
**And** 开始菜单出现 Hagicode Desktop 快捷方式
**And** 系统托盘出现应用图标
**And** 应用启动时窗口以最大化状态显示
**And** 应用启动时不显示开发控制台（DevTools）
**And** 渲染进程内容正确加载，无白屏现象

#### Scenario: 用户在 macOS 平台安装应用

**Given** 用户使用 macOS 11 或更高版本
**When** 用户下载并打开 DMG 安装包
**Then** 应用拖拽到 Applications 文件夹后成功安装
**And** Launchpad 中出现 Hagicode Desktop 应用图标
**And** 菜单栏出现应用图标（macOS 菜单栏集成）
**And** 应用启动时窗口以最大化状态显示（全屏模式或绿色按钮最大化）
**And** 应用启动时不显示开发控制台（DevTools）
**And** 渲染进程内容正确加载，无白屏现象

#### Scenario: 用户在 Linux 平台安装应用

**Given** 用户使用 Linux 发行版（Ubuntu、Fedora 等）
**When** 用户下载并运行 AppImage 或 deb 包
**Then** 应用成功安装或直接运行
**And** 应用菜单中出现 Hagicode Desktop 条目
**And** 系统托盘（如果支持）出现应用图标
**And** 应用启动时窗口以最大化状态显示
**And** 应用启动时不显示开发控制台（DevTools）
**And** 渲染进程内容正确加载，无白屏现象

#### Scenario: 打包应用成功启动

**Given** 用户已安装 Hagicode Desktop 打包版本
**When** 用户启动应用
**Then** 应用正确加载渲染进程界面
**And** 控制台无 "Not allowed to load local resource" 错误
**And** 主窗口以最大化状态正常显示应用内容
**And** 开发控制台（DevTools）不自动打开
**And** asar 包中的资源路径正确解析

#### Scenario: 生产环境路径解析

**Given** 应用以生产模式打包（asar 启用）
**When** 主进程加载渲染进程
**Then** `__dirname` 在 asar 包内正确指向 `dist` 目录
**And** `loadFile()` 成功加载 `dist/renderer/index.html`
**And** preload 脚本路径 `dist/preload/index.mjs` 正确解析
**And** 渲染进程能加载所有 CSS 和 JS 资源

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

## ADDED Requirements

### Requirement: Production Path Resolution

The application MUST correctly resolve file paths when packaged with asar, ensuring that the main process can locate and load the renderer process HTML, CSS, and JavaScript files regardless of whether the application is running in development or production mode.

#### Scenario: Asar 包内的资源路径解析

**Given** 应用已通过 electron-builder 打包为 asar 格式
**When** 主进程尝试加载渲染进程
**Then** `path.join(__dirname, 'renderer', 'index.html')` 正确解析
**And** `loadFile()` 成功加载 HTML 文件
**And** HTML 中的相对路径资源引用正确加载

#### Scenario: Preload 脚本路径解析

**Given** 应用在生产模式下运行
**When** 主进程创建 BrowserWindow 并指定 preload 脚本
**Then** preload 脚本路径相对于 `__dirname` 正确解析
**And** contextBridge 成功初始化
**And** 渲染进程可以访问暴露的 API

#### Scenario: 资源文件路径验证

**Given** 应用启动时
**When** 主进程加载资源文件
**Then** 所有必需的文件存在于预期路径
**And** smoke-test 验证文件存在性
**And** 控制台日志输出解析后的绝对路径用于调试
