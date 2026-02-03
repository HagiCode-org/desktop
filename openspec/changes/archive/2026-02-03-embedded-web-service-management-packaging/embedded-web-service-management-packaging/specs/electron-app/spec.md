# electron-app 规范增量：内嵌 Web 服务管理

此文件包含对 `electron-app` 规范的增量变更，用于添加内嵌 Web 服务管理功能。

## ADDED Requirements

### Requirement: 内嵌 Web 服务进程管理

The application MUST provide the ability to manage an embedded .NET Web service (PCode.Web) process locally, including starting, stopping, status monitoring, and exception recovery.

应用程序必须（MUST）能够在本地管理内嵌的 .NET Web 服务（PCode.Web）进程，包括启动、停止、状态监控和异常恢复。

#### Scenario: 启动内嵌 Web 服务

**Given** 应用程序已启动且内嵌 Web 服务未运行
**When** 用户在主窗口点击 "启动 Web 服务" 按钮
**Then** 应用程序使用 child_process.spawn() 启动 .NET Web 服务可执行文件
**And** 可执行文件路径根据平台自动识别（Windows: .exe, macOS: 无扩展名, Linux: 可执行文件）
**And** 启动时传递平台特定的参数（如端口配置）
**And** 应用程序在 5 秒内完成启动并返回成功状态
**And** 主窗口显示服务状态为 "运行中"
**And** 系统托盘图标更新为运行状态

#### Scenario: 停止内嵌 Web 服务

**Given** 内嵌 Web 服务正在运行
**When** 用户在主窗口点击 "停止 Web 服务" 按钮
**Then** 应用程序显示确认对话框
**And** 用户确认后，应用程序优雅地终止 .NET Web 服务进程
**And** Windows 平台使用进程树终止（taskkill /F /T /PID）
**And** Unix 平台使用进程组终止（kill -PGID）
**And** 如果进程在 10 秒内未响应，强制终止
**And** 主窗口显示服务状态为 "已停止"
**And** 系统托盘图标更新为停止状态
**And** 相关资源完全释放

#### Scenario: 重启内嵌 Web 服务

**Given** 内嵌 Web 服务正在运行
**When** 用户在主窗口点击 "重启 Web 服务" 按钮
**Then** 应用程序显示确认对话框
**And** 用户确认后，先执行停止操作，等待进程完全终止
**And** 然后执行启动操作，启动新的进程实例
**And** 主窗口显示状态变化：运行中 → 停止中 → 已停止 → 启动中 → 运行中
**And** 重启完成后显示成功通知

#### Scenario: 查询 Web 服务进程状态

**Given** 应用程序正在运行
**When** 应用程序定期查询 Web 服务状态（每 5 秒）
**Then** 应用程序检查进程是否存在
**And** 通过 HTTP 请求检查服务健康状态（/api/health 或 /api/status）
**And** 状态结果通过 IPC 推送到渲染进程
**And** UI 实时更新状态指示器

#### Scenario: Web 服务进程崩溃恢复

**Given** 内嵌 Web 服务正在运行
**When** 进程意外崩溃（exit code 非 0 或异常信号）
**Then** 应用程序检测到进程退出事件
**And** 记录崩溃日志（包含退出代码和错误信息）
**And** 更新 UI 状态为 "错误"
**And** 显示进程崩溃通知给用户
**And** 提供用户选项：手动重启或自动重启
**And** 重启计数器增加，防止无限重启循环（最多自动重启 3 次）

---

### Requirement: 软件包拉取和管理

The application MUST dynamically download and install the .NET Web service package based on the user's operating system, rather than bundling it with the desktop application.

应用程序必须（MUST）根据用户操作系统动态下载和安装 .NET Web 服务软件包，而非将其与桌面应用打包在一起。

#### Scenario: 软件包格式和命名

**Given** 软件包已构建完成
**When** 查看软件包目录
**Then** 软件包遵循命名格式：`hagicode-{version}-{platform}.zip`
**And** 平台选项包括：linux-x64, linux-x64-nort, win-x64, win-x64-nort, osx-x64, osx-x64-nort
**And** nort 版本表示不包含 .NET 运行时（用于有运行时的环境）
**And** 本地开发包位于：`/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/`

#### Scenario: 检测软件包安装状态

**Given** 应用程序启动
**When** 应用程序检查 Web 服务软件包
**Then** 读取 `userData/pcode-web/meta.json` 检查安装状态
**And** meta.json 包含：version, platform, installedPath, installDate
**And** 如果 meta.json 不存在或文件缺失，标记为未安装
**And** 返回安装状态信息给渲染进程

#### Scenario: 下载软件包（本地开发环境）

**Given** 用户请求安装 Web 服务
**And** 软件包未安装
**When** 执行软件包下载
**Then** 从本地开发路径复制对应平台的 zip 文件
**And** 复制到 `userData/pcode-web/cache/` 目录
**And** 文件命名保留原始包名
**And** 显示下载进度（复制进度）
**And** 复制完成后验证文件完整性

#### Scenario: 下载软件包（生产环境）

**Given** 用户请求安装 Web 服务
**And** 软件包未安装
**When** 执行软件包下载（生产环境）
**Then** 从配置的 URL 下载对应平台的 zip 文件
**And** 支持断点续传
**And** 下载到 `userData/pcode-web/cache/` 目录
**And** 显示下载进度百分比
**And** 下载完成后验证 SHA256 校验和（如果有）
**And** 下载失败时提供重试选项

#### Scenario: 解压软件包

**Given** 软件包 zip 文件已下载
**When** 执行解压操作
**Then** 解压到 `userData/pcode-web/installed/<platform>/` 目录
**And** 保留 zip 包内的目录结构
**And** 设置可执行文件权限（Linux/macOS 的可执行文件 +x）
**And** 解压失败时回滚（删除不完整文件）
**And** 记录解压日志

#### Scenario: 完整安装流程

**Given** 软件包未安装或需要更新
**When** 用户触发安装流程
**Then** 检查可用磁盘空间（需要至少 300MB）
**And** 下载软件包（或从本地复制）
**And** 解压软件包到安装目录
**And** 更新 meta.json 记录版本和平台信息
**And** 验证安装成功（检查关键文件存在）
**And** 通知渲染进程安装完成

#### Scenario: 平台特定包选择

**Given** 应用程序运行在特定操作系统上
**When** 确定需要下载的软件包
**Then** Windows 平台选择：`hagicode-{version}-win-x64.zip`
**And** macOS 平台选择：`hagicode-{version}-osx-x64.zip`
**And** Linux 平台选择：`hagicode-{version}-linux-x64.zip`
**And** 如果检测到系统已有 .NET 运行时，可选 nort 版本

#### Scenario: 安装失败处理

**Given** 软件包安装过程失败
**When** 捕获到错误
**Then** 停止当前安装操作
**And** 清理不完整的文件（回滚）
**And** 记录详细错误日志
**And** 显示用户友好的错误提示
**And** 提供重试选项或联系支持

#### Scenario: 已安装包验证

**Given** 应用程序启动
**When** 验证已安装的软件包
**Then** 检查 meta.json 中的版本信息
**And** 验证关键文件存在（可执行文件、DLL 等）
**And** 检查文件权限正确
**And** 如果验证失败，提示用户重新安装

---

### Requirement: Web 服务版本管理

The application MUST be able to read and display the version information of the installed Web service package, preparing for future version update functionality.

应用程序必须（MUST）能够读取和显示已安装的 Web 服务软件包的版本信息，为未来的版本更新功能做准备。

#### Scenario: 读取 Web 服务版本信息

**Given** 应用程序启动或用户手动刷新
**When** 调用 get-web-service-version IPC handler
**Then** 从 `userData/pcode-web/meta.json` 读取已安装版本
**And** 验证安装目录中的版本文件（appsettings.yml 或 version.txt）
**And** 解析版本字符串（支持 "1.0.0", "v1.0.0" 等格式）
**And** 通过 IPC 返回版本信息到渲染进程
**And** UI 显示版本号

#### Scenario: 显示版本信息

**Given** 应用程序成功读取到 Web 服务版本
**When** 主窗口加载
**Then** 在 Web 服务状态卡片中显示版本信息
**And** 版本格式为 "PCode.Web v{version}"
**And** 如果无法读取版本或未安装，显示 "Not Installed" 或 "Unknown"
**And** 与桌面应用版本并列显示，便于对比

#### Scenario: 检测可用版本

**Given** 应用程序启动
**When** 检查可用的软件包版本
**Then** 扫描本地开发包目录（`/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/`）
**And** 从包名提取版本号（使用正则表达式）
**And** 返回可用版本列表
**And** 如果有新版本，显示更新提示

---

### Requirement: Web 服务访问地址显示

The application MUST display the access address (URL and port) of the embedded Web service in the UI for user access.

应用程序必须（MUST）在 UI 中显示内嵌 Web 服务的访问地址（URL 和端口），方便用户访问。

#### Scenario: 显示 Web 服务 URL

**Given** 内嵌 Web 服务正在运行
**When** 用户查看主窗口的 Web 服务状态卡片
**Then** 显示完整的访问 URL（如 `http://localhost:5000`）
**And** URL 包含协议、主机和端口
**And** 提供 "在浏览器中打开" 按钮
**And** 点击按钮使用系统默认浏览器打开 URL

#### Scenario: 端口配置和显示

**Given** Web 服务使用可配置的端口
**When** Web 服务启动
**Then** 从配置文件读取端口号（默认 5000）
**And** UI 显示实际使用的端口
**And** 如果端口被占用，显示备用端口
**And** 端口信息实时更新

#### Scenario: 启动前端口检测

**Given** 用户请求启动 Web 服务
**When** 执行启动操作前
**Then** 应用程序检测默认端口是否可用
**And** 如果端口被占用，尝试使用备用端口（5001, 5002, ...）
**And** 最多尝试 5 个端口
**And** 如果所有端口都不可用，显示错误提示
**And** 成功分配端口后，启动 Web 服务并使用该端口

---

### Requirement: Web 服务日志管理

The application MUST capture and log the standard output and error output of the embedded Web service for debugging and troubleshooting.

应用程序必须（MUST）捕获和记录内嵌 Web 服务的标准输出和错误输出，便于调试和问题排查。

#### Scenario: 捕获 Web 服务日志

**Given** 内嵌 Web 服务正在运行
**When** Web 服务输出日志到 stdout 或 stderr
**Then** 应用程序使用 child_process 的 stdout 和 stderr 事件捕获日志
**And** 日志通过 electron-log 记录到文件
**And** 日志文件存储位置：`logs/pcode-web.log`
**And** 日志包含时间戳和日志级别

#### Scenario: 日志格式化

**Given** Web 服务输出原始日志
**When** 应用程序接收日志数据
**Then** 为每行日志添加前缀：`[PCode-Web]`
**And** 保留原始日志的格式和内容
**And** 错误日志额外添加 `[ERROR]` 标记
**And** 日志文件按日期轮转（每天一个文件）

#### Scenario: 日志查看（未来功能）

**Given** 用户需要查看 Web 服务日志
**When** 用户点击 "查看日志" 按钮（占位功能）
**Then** 显示 "日志查看功能即将推出" 提示
**And** 为未来的日志查看器功能预留接口
**And** 可以直接打开日志文件位置（使用系统文件管理器）

---

### Requirement: Web 服务配置管理

The application MUST allow users to configure basic parameters of the embedded Web service, such as port and host binding.

应用程序必须（MUST）允许用户配置内嵌 Web 服务的基本参数，如端口、主机绑定等。

#### Scenario: 读取 Web 服务配置

**Given** 应用程序启动
**When** 初始化 Web 服务管理器
**Then** 从 `appsettings.yml` 读取配置
**And** 解析服务器 URL 配置（Kestrel:Endpoints:Http:Url）
**And** 提取端口号和主机地址
**And** 如果配置文件不存在，使用默认值（localhost:5000）

#### Scenario: 保存 Web 服务配置

**Given** 用户修改 Web 服务配置
**When** 用户点击 "保存配置" 按钮（占位功能）
**Then** 显示 "配置编辑功能即将推出" 提示
**And** 为未来的配置编辑功能预留接口
**And** 当前版本使用固定配置

---

### Requirement: IPC 通信扩展

The application MUST provide new IPC handlers and preload API to support Web service management communication between renderer and main processes.

应用程序必须（MUST）提供新的 IPC handlers 和 preload API，支持渲染进程与主进程之间的 Web 服务管理通信。

#### Scenario: get-web-service-status Handler

**Given** 渲染进程需要查询 Web 服务状态
**When** 调用 `ipcRenderer.invoke('get-web-service-status')`
**Then** 主进程返回当前进程状态：{ status: 'running' | 'stopped' | 'error', pid: number | null }
**And** 如果进程正在运行，返回进程 ID
**And** 响应时间 < 500ms

#### Scenario: start-web-service Handler

**Given** 用户请求启动 Web 服务
**When** 调用 `ipcRenderer.invoke('start-web-service')`
**Then** 主进程启动 Web 服务进程
**And** 返回 { success: boolean, error?: string }
**And** 如果启动失败，返回详细错误信息
**And** 启动过程耗时 < 5 秒

#### Scenario: stop-web-service Handler

**Given** 用户请求停止 Web 服务
**When** 调用 `ipcRenderer.invoke('stop-web-service')`
**Then** 主进程停止 Web 服务进程
**And** 返回 { success: boolean, error?: string }
**And** 确保进程完全终止
**And** 停止过程耗时 < 10 秒

#### Scenario: restart-web-service Handler

**Given** 用户请求重启 Web 服务
**When** 调用 `ipcRenderer.invoke('restart-web-service')`
**Then** 主进程先停止再启动 Web 服务
**And** 返回 { success: boolean, error?: string }
**And** 完整重启流程耗时 < 15 秒

#### Scenario: get-web-service-version Handler

**Given** 渲染进程需要查询 Web 服务版本
**When** 调用 `ipcRenderer.invoke('get-web-service-version')`
**Then** 主进程读取并返回版本信息：{ version: string }
**And** 如果版本未知，返回 { version: 'Unknown' }

#### Scenario: get-web-service-url Handler

**Given** 渲染进程需要获取 Web 服务访问地址
**When** 调用 `ipcRenderer.invoke('get-web-service-url')`
**Then** 主进程返回完整的 URL：{ url: string }
**And** URL 格式为 `http://localhost:{port}`

#### Scenario: 状态变化推送

**Given** Web 服务状态发生变化
**When** 主进程检测到状态变化
**Then** 通过 `mainWindow.webContents.send('web-service-status-changed', status)` 推送状态
**And** 渲染进程通过 `window.electronAPI.onWebServiceStatusChange(callback)` 监听
**And** 状态变化在 1 秒内反映到 UI

---

### Requirement: Redux 状态管理

The application MUST use Redux Toolkit + Redux Saga to manage the embedded Web service state, separating side effects from UI logic and ensuring consistent state management across the application.

应用程序必须（MUST）使用 Redux Toolkit + Redux Saga 管理内嵌 Web 服务状态，将副作用与 UI 逻辑分离，确保整个应用的状态管理一致性。

#### Scenario: Redux State 初始化

**Given** 应用程序启动
**When** 渲染进程初始化
**Then** 创建 Redux store 包含 webService reducer
**And** 初始状态为：{ status: 'stopped', pid: null, url: null, version: null, lastError: null, isOperating: false, restartCount: 0, startTime: null }
**And** 使用 Provider 包裹应用根组件
**And** saga middleware 已注册并开始运行

#### Scenario: 状态转换管理

**Given** Web 服务状态需要更新
**When** 主进程推送状态变化或 saga 收到 IPC 响应
**Then** dispatch 相应的 action（setStatus, setOperating, setError 等）
**And** reducer 纯函数式更新状态
**And** UI 组件通过 useSelector 自动重新渲染
**And** 状态转换遵循状态机规则：stopped → starting → running 或 error

#### Scenario: 异步操作处理（Saga）

**Given** 用户点击启动/停止/重启按钮
**When** 组件 dispatch startWebService/stopWebService/restartWebService action
**Then** saga 拦截 action
**And** 先 dispatch setOperating(true) 更新 UI 为加载状态
**And** 调用 IPC handler 与主进程通信
**And** 根据结果 dispatch setStatus 或 setError
**And** 最后 dispatch setOperating(false) 恢复 UI 状态
**And** 整个过程 UI 保持响应

#### Scenario: 错误处理和恢复

**Given** Web 服务操作失败
**When** saga 捕获到错误
**Then** dispatch setError action，错误信息包含原因
**And** UI 显示错误提示给用户
**And** 用户可以重试操作
**And** dispatch clearError action 清除错误状态

#### Scenario: 状态持久化

**Given** 用户关闭并重新打开应用
**When** 应用重新启动
**Then** Web 服务状态重置为初始值（不持久化运行状态）
**And** 配置信息（如端口）从配置文件读取

---

### Requirement: Web 服务 UI 组件

The application MUST provide dedicated UI components in the main window for displaying and managing the embedded Web service.

应用程序必须（MUST）在主窗口中提供专门的 UI 组件，用于显示和管理内嵌 Web 服务。

#### Scenario: Web 服务状态卡片布局

**Given** 用户打开应用主窗口
**When** 查看 Web 服务管理区域
**Then** 显示一个独立的状态卡片组件
**And** 卡片包含以下元素：
  - 标题："内嵌 Web 服务"
  - 状态指示器（彩色圆点 + 文字）
  - 访问地址（可点击的 URL）
  - 版本信息
  - 控制按钮组（启动/停止/重启）
**And** 布局清晰，易于操作

#### Scenario: 状态指示器视觉设计

**Given** Web 服务处于不同状态
**When** 用户查看状态指示器
**Then** "运行中" 状态：绿色圆点 + 脉冲动画
**And** "已停止" 状态：灰色圆点
**And** "错误" 状态：红色圆点 + 脉冲动画
**And** "启动中" 状态：黄色圆点 + 加载动画
**And** 圆点大小：12px，易于识别

#### Scenario: 控制按钮状态管理

**Given** Web 服务处于特定状态
**When** 用户查看控制按钮
**Then** 服务未运行时：仅 "启动" 按钮可用
**And** 服务运行中：仅 "停止" 和 "重启" 按钮可用
**And** 服务启动中：所有按钮禁用，显示加载动画
**And** 服务停止中：所有按钮禁用，显示加载动画
**And** 按钮样式：启动（绿色）、停止（红色）、重启（蓝色）

#### Scenario: 操作确认对话框

**Given** 用户点击 "停止" 或 "重启" 按钮
**When** 操作执行前
**Then** 显示确认对话框
**And** 对话框内容：
  - 标题："确认操作"
  - 消息："确定要停止/重启 Web 服务吗？"
  - 按钮："取消"（次要）、"确认"（主要）
**And** 用户取消时不执行操作
**And** 用户确认后执行操作

#### Scenario: 操作反馈通知

**Given** 用户执行启动/停止/重启操作
**When** 操作完成
**Then** 显示操作结果通知
**And** 成功时：绿色通知，显示 "Web 服务已启动/停止/重启"
**And** 失败时：红色通知，显示错误原因
**And** 通知自动消失（3 秒后）
**And** 使用 sonner 或类似的通知库

---

## MODIFIED Requirements

### Requirement: Server Status Monitoring

The original specification required connecting to a local or remote Hagico Server. This change MUST add monitoring for the embedded Web service while maintaining the existing remote server functionality.

原规范要求连接到本地或远程 Hagico Server。现在增加对内嵌 Web 服务的监控。

#### Scenario: 区分内嵌服务和远程服务器

**Given** 应用程序启动
**When** 应用程序初始化服务监控
**Then** 同时监控内嵌 Web 服务和远程服务器（如果配置）
**And** UI 中分别显示两者的状态
**And** 状态卡片分为两个区域："内嵌 Web 服务" 和 "远程服务器"
**And** 用户可以独立控制和管理两者

#### Scenario: 优先级处理

**Given** 用户同时使用内嵌服务和远程服务器
**When** 显示服务状态
**Then** 内嵌服务状态优先显示（在更显眼的位置）
**And** 远程服务器状态显示在次要位置
**And** 用户可以在设置中选择默认使用哪个服务

---

## REMOVED Requirements

无。此变更不删除任何现有需求。

---

## RENAMED Requirements

无。此变更不重命名任何现有需求。

---

## Implementation Notes

### 架构设计要点

1. **进程管理器职责**：
   - 负责进程的生命周期管理
   - 不直接与 UI 交互，通过 IPC 通信
   - 提供清晰的接口供主进程调用

2. **IPC 通信层**：
   - 所有 Web 服务操作通过 IPC 进行
   - 使用 `invoke/handle` 模式（双向通信）
   - 使用 `send/on` 模式（状态推送）

3. **UI 组件设计**：
   - 使用 React Hooks 管理状态
   - 组件拆分为可复用的小组件
   - 使用现有的 UI 库（shadcn/ui）

### 文件清单

新增文件：
- `src/main/web-service-manager.ts` - Web 服务进程管理器
- `src/main/package-manager.ts` - 软件包管理器
- `src/main/web-service-config.ts` - Web 服务配置管理
- `src/renderer/store/slices/webServiceSlice.ts` - Redux state slice
- `src/renderer/store/sagas/webServiceSaga.ts` - Redux sagas for Web service
- `src/renderer/store/sagas/index.ts` - Root saga (如果不存在)
- `src/renderer/components/WebServiceStatusCard.tsx` - UI 组件
- `src/renderer/components/PackageInstallDialog.tsx` - 软件包安装对话框（可选）

修改文件：
- `src/main/main.ts` - 添加 IPC handlers（进程管理 + 包管理）
- `src/preload/index.ts` - 扩展 preload API
- `src/renderer/store/configureStore.ts` - 注册 webService reducer
- `src/renderer/store/index.ts` - 导出配置的 store
- `src/renderer/main.tsx` - 添加 Redux Provider
- `src/renderer/App.tsx` - 集成 Web 服务 UI 组件
- `package.json` - 添加 redux-saga、adm-zip 依赖

### 配置项

新增配置项（存储在 ConfigManager 中）：
```typescript
{
  webService: {
    enabled: true,
    port: 5000,
    host: 'localhost',
    autoStart: false,
    maxRestartAttempts: 3
  }
}
```

### 安全考虑

1. **进程权限**：
   - Web 服务以与桌面应用相同的用户权限运行
   - 不需要管理员权限
   - 监听 localhost，不接受外部连接（除非配置）

2. **端口安全**：
   - 默认使用 localhost 绑定
   - 不暴露到公网
   - 用户可配置是否允许远程访问

3. **文件安全**：
   - Web 服务文件只读
   - 防止篡改
   - 定期验证文件完整性（可选）

### 性能优化

1. **启动优化**：
   - 延迟启动（不随应用自动启动）
   - 预加载必要的依赖
   - 使用进程池（未来扩展）

2. **内存优化**：
   - 限制日志缓冲区大小
   - 及时清理进程资源
   - 监控内存使用

3. **CPU 优化**：
   - 降低状态轮询频率（5 秒）
   - 使用增量更新
   - 避免不必要的 UI 重渲染

### 测试策略

1. **单元测试**：
   - 测试进程管理器的各个方法
   - 测试配置解析逻辑
   - 测试错误处理

2. **集成测试**：
   - 测试完整的启动/停止流程
   - 测试 IPC 通信
   - 测试状态更新

3. **端到端测试**：
   - 测试用户交互流程
   - 测试跨平台兼容性
   - 测试打包后的应用

4. **性能测试**：
   - 测量启动时间
   - 测量内存使用
   - 测量响应时间
