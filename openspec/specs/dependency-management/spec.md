# dependency-management Specification

## Purpose
TBD - created by archiving change system-dependency-management-panel. Update Purpose after archive.
## Requirements
### Requirement: 依赖状态检测

应用 MUST 能够自动检测主机是否安装了 Web 服务所需的运行时依赖项，并报告详细的版本信息。

#### Scenario: 应用启动时自动检测依赖

**Given** 应用启动
**When** 主窗口加载完成
**Then** 应用自动检测所有配置的依赖项
**And** 检测结果在 3 秒内返回
**And** 依赖状态展示在依赖管理面板中

#### Scenario: 手动刷新依赖状态

**Given** 用户在依赖管理面板中
**When** 用户点击"刷新"按钮
**Then** 应用重新检测所有依赖项
**And** 更新面板显示最新的检测结果
**And** 显示刷新过程中的加载状态

#### Scenario: 检测已安装的 .NET Runtime

**Given** 主机已安装 .NET 8.0 Runtime
**When** 应用检测 .NET Runtime 依赖
**Then** 返回 `installed: true`
**And** 返回当前版本（如 "8.0.11"）
**And** 版本与要求匹配时标记为"已安装"

#### Scenario: 检测未安装的依赖

**Given** 主机未安装 .NET Runtime
**When** 应用检测 .NET Runtime 依赖
**Then** 返回 `installed: false`
**And** 返回 `versionMismatch: false`
**And** 标记为"未安装"

#### Scenario: 检测版本不匹配的依赖

**Given** 主机已安装 .NET 7.0 Runtime（要求 >= 8.0）
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
**When** 用户点击"使用包管理器安装"按钮
**Then** 应用执行 `winget install Microsoft.DotNet.Runtime.8`
**And** 显示安装进度提示
**And** 安装完成后自动刷新依赖状态

#### Scenario: 使用包管理器安装 .NET Runtime (macOS)

**Given** .NET Runtime 未安装
**And** 系统已安装 Homebrew
**When** 用户点击"使用包管理器安装"按钮
**Then** 应用执行 `brew install --cask dotnet`
**And** 显示安装进度提示
**And** 安装完成后自动刷新依赖状态

#### Scenario: 使用包管理器安装 .NET Runtime (Linux)

**Given** .NET Runtime 未安装
**And** 系统使用 apt 包管理器（Ubuntu/Debian）
**When** 用户点击"使用包管理器安装"按钮
**Then** 应用执行 `sudo apt install -y dotnet-runtime-8.0`
**And** 提示用户需要管理员权限
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

应用 MUST 在依赖管理面板中以清晰直观的方式展示依赖状态，包括安装状态、版本信息和可用操作。

#### Scenario: 显示已安装且版本匹配的依赖

**Given** 依赖已安装且版本满足要求
**When** 渲染依赖管理面板
**Then** 显示绿色 ✅ 图标
**And** 显示"已安装"状态文本
**And** 显示当前版本号
**And** 不显示安装按钮

#### Scenario: 显示未安装的依赖

**Given** 依赖未安装
**When** 渲染依赖管理面板
**Then** 显示红色 ❌ 图标
**And** 显示"未安装"状态文本
**And** 显示要求的版本范围
**And** 显示"使用包管理器安装"按钮（如可用）
**And** 显示"访问官网下载"按钮

#### Scenario: 显示版本不匹配的依赖

**Given** 依赖已安装但版本低于要求
**When** 渲染依赖管理面板
**Then** 显示黄色 ⚠️ 图标
**And** 显示"版本不匹配"状态文本
**And** 显示当前版本和要求的版本范围
**And** 显示"升级"或"重新安装"按钮

#### Scenario: 显示检测中的加载状态

**Given** 应用正在执行依赖检测
**When** 渲染依赖管理面板
**Then** 显示旋转加载图标
**And** 显示"正在检测依赖..."提示文本
**And** 禁用"刷新"按钮

---

### Requirement: 错误处理和用户反馈

应用 MUST 在依赖检测或安装失败时提供清晰的错误信息和恢复建议。

#### Scenario: 依赖检测失败

**Given** 执行依赖检测时发生错误
**When** 检测命令执行失败或返回异常
**Then** 在面板中显示错误警告框
**And** 提供友好的错误描述
**And** 提供"重试"按钮
**And** 在控制台记录详细错误日志

#### Scenario: 安装命令执行失败（权限不足）

**Given** 用户点击"使用包管理器安装"
**When** 安装命令因权限不足而失败
**Then** 显示错误提示："需要管理员权限"
**And** 提示用户以管理员身份运行应用或手动安装
**And** 提供"访问官网下载"按钮作为备选

#### Scenario: 安装命令执行失败（网络错误）

**Given** 用户点击"使用包管理器安装"
**When** 安装命令因网络不可用而失败
**Then** 显示错误提示："网络连接失败"
**And** 建议用户检查网络连接
**And** 提供"重试"按钮和"访问官网下载"按钮

---

### Requirement: 依赖类型可扩展性

应用架构 MUST 支持便捷地添加新的依赖类型检测器，为未来扩展（Node.js、Java 等）奠定基础。

#### Scenario: 添加新的依赖类型

**Given** 需要添加 Node.js 依赖检测
**When** 开发者实现 `checkNodeJs()` 函数
**And** 在 `dependencyCheckers` 映射中注册
**And** 在依赖配置列表中添加 Node.js 条目
**Then** 应用自动检测 Node.js 依赖
**And** 在面板中显示 Node.js 状态
**And** 提供相应的安装引导

#### Scenario: 依赖检测器接口一致性

**Given** 需要实现新的依赖检测器
**When** 编写检测函数
**Then** 函数返回 `Promise<DependencyCheckResult>`
**And** 包含所有必需的字段（name, type, installed, version 等）
**And** 遵循统一的错误处理模式

---

### Requirement: 国际化支持

依赖管理面板 MUST 支持中文和英文界面语言。

#### Scenario: 中文界面显示

**Given** 用户选择中文语言
**When** 渲染依赖管理面板
**Then** 所有文本使用中文显示
**And** 状态文本为"已安装"、"未安装"、"版本不匹配"
**And** 按钮文本为"使用包管理器安装"、"访问官网下载"、"刷新"

#### Scenario: 英文界面显示

**Given** 用户选择英文语言
**When** 渲染依赖管理面板
**Then** 所有文本使用英文显示
**And** 状态文本为"Installed"、"Not Installed"、"Version Mismatch"
**And** 按钮文本为"Install via Package Manager"、"Visit Official Download"、"Refresh"

#### Scenario: 语言切换时实时更新

**Given** 用户在依赖管理面板中
**When** 用户切换界面语言
**Then** 面板中的所有文本立即更新为新语言
**And** 不影响当前的依赖状态数据

