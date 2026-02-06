# dependency-management Specification Delta

## ADDED Requirements

### Requirement: 基于 Manifest 的依赖项检查

应用 MUST 能够从已安装软件包的 manifest.json 文件中读取依赖项配置，并根据配置内容执行依赖项检查。

#### Scenario: 安装后自动读取 Manifest 并检查依赖

**Given** 用户成功安装软件包
**When** 安装流程完成
**Then** 应用自动读取 `{installPath}/manifest.json`
**And** 解析 `dependencies` 配置段
**And** 根据每个依赖项的配置执行检查
**And** 将检查结果存储在内存中供 UI 访问

#### Scenario: Manifest 文件不存在时优雅降级

**Given** 用户安装的软件包不包含 manifest.json
**When** 尝试读取 Manifest 文件
**Then** 返回空依赖项列表
**And** 不抛出错误或中断应用流程
**And** 在 UI 中显示"该软件包未提供依赖项信息"提示

#### Scenario: 解析 Manifest 依赖项配置

**Given** manifest.json 包含多个依赖项配置
**When** 解析依赖项
**Then** 提取每个依赖项的 `name`、`type`、`version` 约束
**Then** 提取 `checkCommand` 用于检测
**Then** 提取 `installCommand` 或 `installHint` 用于安装引导

---

### Requirement: 版本约束支持

依赖检查系统 MUST 支持 Manifest 中定义的多种版本约束类型，包括精确版本、版本范围和推荐版本。

#### Scenario: 精确版本检查（exact）

**Given** 依赖项配置了 `"exact": "0.23.0"`
**When** 检查该依赖项版本
**Then** 仅当已安装版本完全匹配时返回 `installed: true`
**And** 版本不匹配时返回 `versionMismatch: true`
**And** 显示要求："必须为 0.23.0"

#### Scenario: 版本范围检查（min/max）

**Given** 依赖项配置了 `"min": "20.11.0"` 和 `"max": "99.999.999"`
**When** 检查该依赖项版本
**Then** 版本 >= 20.11.0 时返回 `installed: true`
**And** 版本 < 20.11.0 时返回 `versionMismatch: true`
**And** 显示要求："需要 20.11.0 或更高版本"

#### Scenario: 推荐版本显示

**Given** 依赖项配置了 `"recommended": "24.12.0"`
**When** 依赖项已安装但版本不是推荐版本
**Then** 仍然返回 `installed: true`
**And** 在 UI 中显示"当前版本 X.X.X（推荐 Y.Y.Y）"提示

---

### Requirement: 多类型运行时检查

系统 MUST 支持 Manifest 中定义的不同类型依赖项的检查方式，包括系统运行时和 NPM 包。

#### Scenario: 检查系统运行时依赖（system-runtime）

**Given** 依赖项类型为 `"system-runtime"`（如 .NET、Node.js）
**When** 执行依赖检查
**Then** 使用配置的 `checkCommand` 执行系统命令
**Then** 解析命令输出提取版本号
**And** 验证版本是否满足约束

#### Scenario: 检查 NPM 包依赖（npm）

**Given** 依赖项类型为 `"npm"`（如 Claude Code、OpenSpec）
**When** 执行依赖检查
**Then** 使用 `which`/`where` 命令检查包是否在 PATH 中
**Then** 使用 `{packageName} --version` 获取版本
**And** 验证版本是否满足约束

#### Scenario: 检查系统要求（system-requirement）

**Given** 依赖项类型为 `"system-requirement"`（如操作系统、架构）
**When** 执行依赖检查
**Then** 验证当前系统是否符合要求
**And** 检查操作系统是否在支持的列表中
**And** 检查架构是否匹配

---

### Requirement: 依赖项状态可视化

应用 MUST 在系统管理视图中展示从 Manifest 读取的依赖项及其状态。

#### Scenario: 显示已安装软件包的依赖项

**Given** 用户已安装包含 manifest.json 的软件包
**When** 用户打开系统管理视图
**Then** 在"依赖检查"卡片中显示所有依赖项
**And** 每个依赖项显示名称、描述、状态图标
**And** 已安装依赖项显示绿色✓和当前版本
**And** 未安装依赖项显示红色✗和安装按钮

#### Scenario: 无软件包安装时的空状态

**Given** 用户未安装任何软件包
**When** 用户打开系统管理视图
**Then** 依赖检查卡片显示"请先安装软件包"
**And** 不执行任何依赖检查

#### Scenario: 依赖项检查失败时的错误显示

**Given** 执行依赖检查时发生错误
**When** 渲染依赖检查卡片
**Then** 显示错误提示框
**And** 提供重试按钮
**And** 在控制台记录详细错误日志

---

### Requirement: 依赖项安装引导增强

应用 MUST 使用 Manifest 中提供的安装命令或提示，为用户提供准确的依赖项安装指导。

#### Scenario: 使用 Manifest 中的 installCommand

**Given** 依赖项配置了 `"installCommand"`
**When** 用户点击"安装"按钮
**Then** 执行 Manifest 中指定的安装命令
**And** 显示安装进度
**And** 安装完成后刷新依赖状态

#### Scenario: 使用 Manifest 中的 installHint

**Given** 依赖项仅配置了 `"installHint"`（如 .NET Runtime）
**When** 依赖项未安装
**Then** 显示"访问官网下载"按钮
**And** 点击按钮打开 installHint 中的 URL
**And** 或显示 installHint 文本作为安装指导

---

### Requirement: 依赖项实时刷新

应用 MUST 允许用户手动刷新依赖项状态，并在软件包重新安装后自动更新。

#### Scenario: 用户手动刷新依赖状态

**Given** 用户在系统管理视图中
**When** 用户点击"刷新依赖"按钮
**Then** 重新读取 manifest.json
**And** 重新执行所有依赖检查
**And** 更新 UI 显示最新状态

#### Scenario: 软件包重装后自动更新

**Given** 用户当前查看依赖项面板
**When** 用户重新安装软件包
**Then** 自动触发依赖项重新检查
**And** UI 显示最新的依赖项状态

---

### Requirement: 依赖项检查结果缓存

应用 MUST 缓存依赖项检查结果以提升性能，并在适当的时候使缓存失效。

#### Scenario: 首次检查并缓存结果

**Given** 应用启动或软件包刚安装
**When** 执行依赖项检查
**Then** 将检查结果存储在内存中
**And** 后续获取依赖项时直接返回缓存结果

#### Scenario: 手动刷新时更新缓存

**Given** 已有缓存的依赖项检查结果
**When** 用户点击"刷新"按钮
**Then** 重新执行依赖检查
**And** 用新结果替换缓存

#### Scenario: 软件包变更时清除缓存

**Given** 已有缓存的依赖项检查结果
**When** 用户安装新版本软件包
**Then** 清除之前的缓存
**And** 触发新的依赖检查
