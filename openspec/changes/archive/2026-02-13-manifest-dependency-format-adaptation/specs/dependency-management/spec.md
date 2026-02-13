## MODIFIED Requirements

### Requirement: 依赖状态检测

应用 MUST 能够自动检测主机是否安装了 Web 服务所需的运行时依赖项，通过执行 manifest 中 `entryPoint.check` 指定的脚本，并报告详细的版本信息。

#### Scenario: 应用启动时自动检测依赖

**Given** 应用启动
**When** 主窗口加载完成
**Then** 应用读取 manifest 中的 `entryPoint.check` 脚本路径
**And** 在安装目录执行检查脚本
**And** 检测结果在 3 秒内返回
**And** 依赖状态展示在依赖管理面板中

#### Scenario: 手动刷新依赖状态

**Given** 用户在依赖管理面板中
**When** 用户点击"刷新"按钮
**Then** 应用重新执行 `entryPoint.check` 脚本
**And** 更新面板显示最新的检测结果
**And** 显示刷新过程中的加载状态

#### Scenario: 检测已安装的 .NET Runtime

**Given** 主机已安装 .NET 10.0 Runtime
**And** manifest 中 `entryPoint.check` 指向 `scripts/check.sh`
**When** 应用执行检查脚本
**Then** 脚本返回版本信息（如 "10.0.0"）
**And** 返回 `installed: true`
**And** 版本与 `version.runtime` 要求匹配时标记为"已安装"

#### Scenario: 检测未安装的依赖

**Given** 主机未安装 .NET Runtime
**When** 应用执行 `entryPoint.check` 脚本
**Then** 脚本返回非零退出码或空输出
**And** 返回 `installed: false`
**And** 标记为"未安装"

#### Scenario: 检查脚本不存在时显示 installHint

**Given** `entryPoint.check` 指定的脚本文件不存在
**When** 应用尝试执行检查
**Then** 显示 `installHint` 中的手动安装指引
**And** 标记依赖状态为"需要手动检查"

---

### Requirement: 跨平台依赖检测

应用 MUST 在 Windows、macOS 和 Linux 平台上提供一致的依赖检测功能，通过执行对应平台的检查脚本。

#### Scenario: Windows 平台执行检查脚本

**Given** 应用运行在 Windows 10 或更高版本
**When** 执行依赖检测
**Then** 查找 `entryPoint.check` 对应的 `.bat` 或 `.ps1` 脚本
**And** 在安装目录下执行脚本
**And** 正确解析脚本输出获取版本信息

#### Scenario: macOS 平台执行检查脚本

**Given** 应用运行在 macOS 11 或更高版本
**When** 执行依赖检测
**Then** 查找 `entryPoint.check` 对应的 `.sh` 脚本
**And** 在安装目录下执行脚本
**And** 正确解析脚本输出获取版本信息

#### Scenario: Linux 平台执行检查脚本

**Given** 应用运行在 Linux 发行版（Ubuntu、Fedora 等）
**When** 执行依赖检测
**Then** 查找 `entryPoint.check` 对应的 `.sh` 脚本
**And** 在安装目录下执行脚本
**And** 正确解析脚本输出获取版本信息

---

### Requirement: 依赖安装引导

应用 MUST 为缺失的依赖项通过执行 manifest 中 `entryPoint.install` 指定的脚本进行安装，并在自动安装失败时提供 `installHint` 作为手动安装指引。

#### Scenario: 通过脚本安装依赖

**Given** 依赖未安装
**And** `entryPoint.install` 脚本存在
**When** 用户点击"安装"按钮
**Then** 应用在安装目录执行 `entryPoint.install` 脚本
**And** 显示安装进度提示
**And** 安装完成后自动执行 `entryPoint.check` 刷新依赖状态

#### Scenario: Windows 平台执行安装脚本

**Given** 应用运行在 Windows
**And** 依赖未安装
**When** 执行安装
**Then** 查找并执行 `.bat` 或 `.ps1` 安装脚本
**And** 脚本可能调用 winget 或其他包管理器

#### Scenario: macOS/Linux 平台执行安装脚本

**Given** 应用运行在 macOS 或 Linux
**And** 依赖未安装
**When** 执行安装
**Then** 查找并执行 `.sh` 安装脚本
**And** 脚本可能调用 brew、apt 等包管理器

#### Scenario: 安装脚本执行失败时显示 installHint

**Given** 依赖未安装
**And** `entryPoint.install` 脚本执行失败
**When** 安装过程结束
**Then** 显示错误信息
**And** 显示 `installHint` 中的手动安装指引
**And** 提供"访问官网下载"按钮（如 installHint 包含 URL）

#### Scenario: 安装脚本不存在时显示 installHint

**Given** 依赖未安装
**And** `entryPoint.install` 指定的脚本不存在
**When** 用户请求安装
**Then** 直接显示 `installHint` 中的手动安装指引
**And** 不尝试执行自动安装

---

## ADDED Requirements

### Requirement: EntryPoint 脚本执行

应用 MUST 支持执行 manifest 中定义的 `entryPoint` 脚本，包括 `install`、`check` 和 `start` 三种类型。

#### Scenario: 执行检查脚本获取版本

**Given** manifest 定义了 `entryPoint.check`
**And** 脚本路径为 `scripts/check.sh`
**When** 应用执行检查
**Then** 在包安装目录下查找并执行 `scripts/check.sh`
**And** 捕获脚本的标准输出
**And** 从输出中解析版本号

#### Scenario: 执行安装脚本安装依赖

**Given** manifest 定义了 `entryPoint.install`
**And** 脚本路径为 `scripts/install.sh`
**When** 用户请求安装依赖
**Then** 在包安装目录下查找并执行 `scripts/install.sh`
**And** 实时显示脚本输出
**And** 返回执行结果（成功/失败）

#### Scenario: 脚本执行超时处理

**Given** 正在执行 entryPoint 脚本
**When** 脚本执行超过 5 分钟
**Then** 终止脚本进程
**And** 返回超时错误
**And** 显示 `installHint` 作为备选方案

---

### Requirement: 依赖类型区分

应用 MUST 根据 manifest 中的 `type` 字段区分不同类型的依赖，并采用相应的处理策略。

#### Scenario: 处理 system-runtime 类型依赖

**Given** 依赖的 `type` 为 `system-runtime`
**When** 执行依赖检查和安装
**Then** 执行 `entryPoint.check` 和 `entryPoint.install` 脚本
**And** 验证 `version.runtime` 版本约束

#### Scenario: 处理 npm 类型依赖

**Given** 依赖的 `type` 为 `npm`
**When** 执行依赖检查和安装
**Then** 执行对应的 entryPoint 脚本
**And** 脚本内部处理 npm 包安装逻辑

#### Scenario: 跳过 system-requirement 类型依赖

**Given** 依赖的 `type` 为 `system-requirement`
**When** 解析依赖列表
**Then** 跳过该依赖的自动检查和安装
**And** 仅显示为信息提示

---

### Requirement: Runtime 版本约束验证

应用 MUST 支持 manifest 中定义的 `version.runtime` 嵌套版本约束，用于验证运行时版本。

#### Scenario: 验证 runtime 最低版本

**Given** 依赖定义了 `version.runtime.min: "10.0.0"`
**And** 检测到的 runtime 版本为 "9.0.0"
**When** 执行版本验证
**Then** 返回 `versionMismatch: true`
**And** 显示"需要升级到 10.0.0 或更高版本"

#### Scenario: 验证 runtime 推荐版本

**Given** 依赖定义了 `version.runtime.recommended: "10.0.0"`
**And** 检测到的 runtime 版本为 "10.0.0"
**When** 执行版本验证
**Then** 返回 `installed: true`
**And** 显示"已安装推荐版本"

## REMOVED Requirements

### Requirement: 内联命令执行

**Reason**: 新的 manifest 格式（0.1.0-beta.4）已移除 `installCommand` 和 `checkCommand` 字段，改为使用 `entryPoint` 脚本执行。

**Migration**: 所有依赖检查和安装操作现在通过 `entryPoint.check` 和 `entryPoint.install` 脚本执行。包开发者需要在 manifest 中定义 `entryPoint` 字段，并提供对应的脚本文件。
