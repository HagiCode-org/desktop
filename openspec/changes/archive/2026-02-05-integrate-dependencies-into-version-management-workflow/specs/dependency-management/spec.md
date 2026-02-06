## MODIFIED Requirements

### Requirement: 依赖状态检测

应用 MUST 能够自动检测主机是否安装了 Web 服务所需的运行时依赖项，并报告详细的版本信息。依赖项检查 SHALL 作为版本安装流程的组成部分，在版本管理界面中展示，而非作为独立功能。

#### Scenario: 版本安装后自动检测依赖

**Given** 用户完成版本安装
**When** 安装流程结束
**Then** 应用自动读取该版本的 manifest.yaml
**And** 提取依赖项列表并执行检测
**And** 检测结果在版本管理页面中展示
**And** 检测结果持久化存储到 electron-store

#### Scenario: 应用启动时自动检测当前激活版本依赖

**Given** 应用启动
**When** 主窗口加载完成
**And** 存在已激活的版本
**Then** 应用自动检测激活版本的依赖项
**And** 检测结果在 3 秒内返回
**And** 依赖状态展示在仪表盘和版本管理页面中

#### Scenario: 在版本管理页面手动刷新依赖状态

**Given** 用户在版本管理页面中
**When** 用户点击"刷新依赖项"按钮
**Then** 应用重新检测当前选中版本的依赖项
**And** 更新页面显示最新的检测结果
**And** 显示刷新过程中的加载状态

#### Scenario: 检测已安装的 .NET Runtime

**Given** 主机已安装 .NET 10.0 Runtime
**When** 应用检测 .NET Runtime 依赖
**Then** 返回 `installed: true`
**And** 返回当前版本（如 "10.0.0"）
**And** 版本与要求匹配时标记为"已安装"

#### Scenario: 检测未安装的依赖

**Given** 主机未安装 .NET Runtime
**When** 应用检测 .NET Runtime 依赖
**Then** 返回 `installed: false`
**And** 返回 `versionMismatch: false`
**And** 标记为"未安装"

#### Scenario: 检测版本不匹配的依赖

**Given** 主机已安装 .NET 8.0 Runtime（要求 >= 10.0）
**When** 应用检测 .NET Runtime 依赖
**Then** 返回 `installed: true`
**And** 返回 `versionMismatch: true`
**And** 显示当前版本和要求的版本范围

---

### Requirement: 跨平台依赖检测

应用 MUST 在 Windows、macOS 和 Linux 平台上提供一致的依赖检测功能。

#### Scenario: Windows 平台检测 .NET Runtime

**Given** 应用运行在 Windows 10 或更高版本
**When** 执行依赖检测
**Then** 通过 `dotnet --list-runtimes` 命令检测
**And** 正确解析命令输出获取版本信息

#### Scenario: macOS 平台检测 .NET Runtime

**Given** 应用运行在 macOS 11 或更高版本
**When** 执行依赖检测
**Then** 通过 `dotnet --list-runtimes` 命令检测
**And** 正确解析命令输出获取版本信息

#### Scenario: Linux 平台检测 .NET Runtime

**Given** 应用运行在 Linux 发行版（Ubuntu、Fedora 等）
**When** 执行依赖检测
**Then** 通过 `dotnet --list-runtimes` 命令检测
**And** 正确解析命令输出获取版本信息

---

### Requirement: 依赖安装引导

应用 MUST 为缺失的依赖项提供便捷的安装方式，优先使用系统包管理器，并提供官方下载链接作为备选。

#### Scenario: 使用包管理器安装 .NET Runtime (Windows)

**Given** .NET Runtime 未安装
**And** 系统已安装 winget
**When** 用户在版本管理页面点击"使用 winget 安装"按钮
**Then** 应用执行 `winget install Microsoft.DotNet.Runtime.10`
**And** 显示安装进度提示
**And** 安装完成后自动刷新依赖状态

#### Scenario: 使用包管理器安装 .NET Runtime (macOS)

**Given** .NET Runtime 未安装
**And** 系统已安装 Homebrew
**When** 用户在版本管理页面点击"使用 Homebrew 安装"按钮
**Then** 应用执行 `brew install --cask dotnet`
**And** 显示安装进度提示
**And** 安装完成后自动刷新依赖状态

#### Scenario: 使用包管理器安装 .NET Runtime (Linux)

**Given** .NET Runtime 未安装
**And** 系统使用 apt 包管理器（Ubuntu/Debian）
**When** 用户在版本管理页面点击"使用 apt 安装"按钮
**Then** 应用执行 `sudo apt install -y dotnet-runtime-10.0`
**And** 提示用户需要管理员权限
**And** 安装完成后自动刷新依赖状态

#### Scenario: 使用 npm 安装全局包

**Given** manifest.yaml 中声明了 npm 全局包依赖
**When** 该 npm 包未安装
**Then** 显示"使用 npm 安装"按钮
**And** 点击按钮执行 `npm install -g <package>@<version>`
**And** 显示安装进度和结果
**And** 安装完成后自动刷新依赖状态

#### Scenario: 包管理器不可用时提供下载链接

**Given** .NET Runtime 未安装
**And** 系统未安装 winget/brew/apt
**When** 依赖状态显示
**Then** 显示"访问官网下载"按钮
**And** 按钮链接到 .NET 官方下载页面
**And** 点击按钮在系统默认浏览器中打开链接

---

### Requirement: 依赖状态可视化

应用 MUST 在版本管理界面中以清晰直观的方式展示依赖状态，包括安装状态、版本信息和可用操作。

#### Scenario: 显示已安装且版本匹配的依赖

**Given** 依赖已安装且版本满足要求
**When** 渲染版本管理页面的依赖项卡片
**Then** 显示绿色 ✓ 图标
**And** 显示"已安装"状态文本
**And** 显示当前版本号
**And** 不显示安装按钮

#### Scenario: 显示未安装的依赖

**Given** 依赖未安装
**When** 渲染版本管理页面的依赖项卡片
**Then** 显示红色 ✗ 图标
**And** 显示"未安装"状态文本
**And** 显示要求的版本范围
**And** 显示相应的安装按钮（winget/brew/apt/npm）
**And** 显示"访问官网下载"按钮

#### Scenario: 显示版本不匹配的依赖

**Given** 依赖已安装但版本低于要求
**When** 渲染版本管理页面的依赖项卡片
**Then** 显示黄色 ⚠ 图标
**And** 显示"版本不匹配"状态文本
**And** 显示当前版本和要求的版本范围
**And** 显示"升级"或"重新安装"按钮

#### Scenario: 显示检测中的加载状态

**Given** 应用正在执行依赖检测
**When** 渲染版本管理页面
**Then** 在依赖项卡片区域显示旋转加载图标
**And** 显示"正在检测依赖..."提示文本
**And** 禁用"刷新"按钮

#### Scenario: 版本依赖项全部满足时启用服务

**Given** 版本已安装
**And** 所有依赖项已满足
**When** 用户在仪表盘查看版本状态
**Then** 显示"✓ 所有依赖项已满足"
**And** "启用服务"按钮可用

#### Scenario: 版本缺少依赖项时禁用服务启用

**Given** 版本已安装
**And** 存在未满足的依赖项
**When** 用户在仪表盘查看版本状态
**Then** 显示"⚠ 缺少依赖项"
**And** 显示"查看依赖项"按钮，点击跳转到版本管理页面
**And** "启用服务"按钮禁用或隐藏

---

### Requirement: 错误处理和用户反馈

应用 MUST 在依赖检测或安装失败时提供清晰的错误信息和恢复建议。

#### Scenario: 依赖检测失败

**Given** 执行依赖检测时发生错误
**When** 检测命令执行失败或返回异常
**Then** 在依赖项卡片中显示错误警告框
**And** 提供友好的错误描述
**And** 提供"重试"按钮
**And** 在控制台记录详细错误日志

#### Scenario: 安装命令执行失败（权限不足）

**Given** 用户在版本管理页面点击安装按钮
**When** 安装命令因权限不足而失败
**Then** 显示错误提示："需要管理员权限"
**And** 提示用户以管理员身份运行应用或手动安装
**And** 提供"访问官网下载"按钮作为备选

#### Scenario: 安装命令执行失败（网络错误）

**Given** 用户在版本管理页面点击安装按钮
**When** 安装命令因网络不可用而失败
**Then** 显示错误提示："网络连接失败"
**And** 建议用户检查网络连接
**And** 提供"重试"按钮和"访问官网下载"按钮

#### Scenario: manifest.yaml 解析失败

**Given** 版本安装完成但读取 manifest.yaml 失败
**When** 尝试提取依赖项信息
**Then** 显示警告："无法读取依赖项信息"
**And** 提示用户手动检查依赖项
**And** 在控制台记录详细错误日志

---

### Requirement: 依赖类型可扩展性

应用架构 MUST 支持便捷地添加新的依赖类型检测器，为未来扩展（Node.js、Java 等）奠定基础。

#### Scenario: 添加新的依赖类型

**Given** 需要添加 Python 依赖检测
**When** 开发者实现 `checkPython()` 函数
**And** 在 `dependencyCheckers` 映射中注册
**And** 在 manifest.yaml dependencies 中添加 Python 条目
**Then** 应用自动检测 Python 依赖
**And** 在版本管理页面中显示 Python 状态
**And** 提供相应的安装引导

#### Scenario: 从 manifest.yaml 动态解析依赖项

**Given** manifest.yaml 中定义了多种依赖类型
**When** 应用读取 manifest.yaml
**Then** 自动识别每个依赖项的 type 字段
**And** 动态调用对应的检测函数
**And** 统一返回检测结果

#### Scenario: 依赖检测器接口一致性

**Given** 需要实现新的依赖检测器
**When** 编写检测函数
**Then** 函数返回 `Promise<DependencyCheckResult>`
**And** 包含所有必需的字段（name, type, installed, version 等）
**And** 遵循统一的错误处理模式

---

### Requirement: 国际化支持

依赖管理界面 MUST 支持中文和英文界面语言。

#### Scenario: 中文界面显示

**Given** 用户选择中文语言
**When** 渲染版本管理页面的依赖项卡片
**Then** 所有文本使用中文显示
**And** 状态文本为"已安装"、"未安装"、"版本不匹配"
**And** 按钮文本为"使用 winget 安装"、"使用 Homebrew 安装"、"访问官网下载"、"刷新依赖项"

#### Scenario: 英文界面显示

**Given** 用户选择英文语言
**When** 渲染版本管理页面的依赖项卡片
**Then** 所有文本使用英文显示
**And** 状态文本为"Installed"、"Not Installed"、"Version Mismatch"
**And** 按钮文本为"Install via winget"、"Install via Homebrew"、"Visit Official Download"、"Refresh Dependencies"

#### Scenario: 语言切换时实时更新

**Given** 用户在版本管理页面中
**When** 用户切换界面语言
**Then** 依赖项卡片中的所有文本立即更新为新语言
**And** 不影响当前的依赖状态数据

---

## ADDED Requirements

### Requirement: 基于 Manifest 的依赖项检查

应用 MUST 能够从版本的 manifest.yaml 文件中读取依赖项声明，并执行相应的检查。

#### Scenario: 读取 manifest.yaml 中的依赖项

**Given** 版本已安装
**And** manifest.yaml 包含 dependencies 节点
**When** 应用读取 manifest.yaml
**Then** 解析 dependencies 数组
**And** 提取每个依赖项的 name、type、version 要求
**And** 传递给 DependencyManager 执行检查

#### Scenario: 支持多种依赖项类型

**Given** manifest.yaml 中定义了多种类型的依赖
**When** 应用解析依赖项
**Then** 识别 `system-runtime` 类型（.NET、Node.js 等）
**And** 识别 `npm` 类型（npm 全局包）
**And** 识别 `system-requirement` 类型（操作系统版本、磁盘空间等）
**And** 为每种类型调用相应的检测器

#### Scenario: 版本约束解析

**Given** manifest.yaml 中定义了依赖项版本约束
**When** 应用解析版本要求
**Then** 支持 `exact` 字段用于精确版本匹配
**And** 支持 `min` 字段用于最低版本要求
**And** 支持 `max` 字段用于最高版本限制
**And** 传递版本约束信息给检测器

#### Scenario: manifest.yaml 缺失或无效

**Given** 版本已安装
**And** manifest.yaml 文件不存在
**When** 应用尝试读取依赖项
**Then** 显示警告："该版本未提供依赖项信息"
**And** 不显示依赖项卡片
**And** 允许用户手动检查依赖项

---

### Requirement: 版本依赖状态持久化

应用 MUST 将每个已安装版本的依赖项检查结果持久化存储，以便快速查询和展示。

#### Scenario: 存储依赖项检查结果

**Given** 版本安装完成并执行依赖项检查
**When** 依赖项检查完成
**Then** 将检查结果存储到 electron-store 的 `installedVersions` 字段
**And** 包含版本 ID、依赖项列表、每个依赖项的状态
**And** 包含检查时间戳

#### Scenario: 读取已存储的依赖项状态

**Given** 用户打开版本管理页面
**When** 页面加载已安装版本列表
**Then** 从 electron-store 读取依赖项状态
**And** 直接显示缓存的状态，无需重新检查
**And** 提供"刷新"按钮允许用户手动更新状态

#### Scenario: 依赖项状态过期处理

**Given** 依赖项检查结果已存储超过 24 小时
**When** 用户打开版本管理页面
**Then** 标记状态为"可能过期"
**And** 提示用户刷新依赖项状态
**And** 自动在后台执行检查并更新存储
