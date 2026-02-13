## MODIFIED Requirements

### Requirement: 依赖状态检测

应用 MUST 能够自动检测主机是否安装了 Web 服务所需的运行时依赖项，并报告详细的版本信息。依赖检查脚本在完成检测后 MUST 自动退出，无需用户干预。

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
**And** 返回当前版本（如 "8.0.8"）
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

#### Scenario: Windows 依赖检查脚本自动退出

**Given** 应用运行在 Windows 平台
**And** 依赖检查脚本 `check.bat` 执行完成
**When** 脚本完成所有依赖检测并写入结果文件
**Then** 脚本自动退出并返回退出码 0
**And** 无需用户按 Ctrl+C 终止进程
**And** DependencyManager 收到进程退出事件
**And** `check-result.json` 在进程退出前完成写入

#### Scenario: 依赖检查脚本超时处理

**Given** 依赖检查脚本执行时间超过配置的超时时间（5分钟）
**When** 超时计时器触发
**Then** DependencyManager 终止脚本进程
**And** 记录超时错误日志
**And** 返回失败结果给调用者
**And** 用户看到清晰的错误提示

---

### Requirement: 跨平台依赖检测

应用 MUST 在 Windows、macOS 和 Linux 平台上提供一致的依赖检测功能。所有平台的检查脚本 MUST 在完成后自动退出。

#### Scenario: Windows 平台检测 .NET Runtime

**Given** 应用运行在 Windows 10 或更高版本
**When** 执行依赖检测
**Then** 通过 `dotnet --list-runtimes` 命令检测
**And** 正确解析命令输出获取版本信息
**And** 检查脚本在完成后自动退出

#### Scenario: macOS 平台检测 .NET Runtime

**Given** 应用运行在 macOS 11 或更高版本
**When** 执行依赖检测
**Then** 通过 `dotnet --list-runtimes` 命令检测
**And** 正确解析命令输出获取版本信息
**And** 检查脚本在完成后自动退出

#### Scenario: Linux 平台检测 .NET Runtime

**Given** 应用运行在 Linux 发行版（Ubuntu、Fedora 等）
**When** 执行依赖检测
**Then** 通过 `dotnet --list-runtimes` 命令检测
**And** 正确解析命令输出获取版本信息
**And** 检查脚本在完成后自动退出

---

### Requirement: 错误处理和用户反馈

应用 MUST 在依赖检测或安装失败时提供清晰的错误信息和恢复建议。进程管理 MUST 提供详细的日志以诊断脚本执行问题。

#### Scenario: 依赖检测失败

**Given** 执行依赖检测时发生错误
**When** 检测命令执行失败或返回异常
**Then** 在面板中显示错误警告框
**And** 提供友好的错误描述
**And** 提供"重试"按钮
**And** 在控制台记录详细错误日志

#### Scenario: 依赖检查脚本异常终止

**Given** 依赖检查脚本正在执行
**When** 脚本因错误而崩溃或被外部终止
**Then** DependencyManager 检测到非正常退出码
**And** 记录详细的错误日志（包括退出码和输出）
**And** 返回失败结果给用户
**And** 日志中明确区分正常退出、超时终止和异常终止

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
