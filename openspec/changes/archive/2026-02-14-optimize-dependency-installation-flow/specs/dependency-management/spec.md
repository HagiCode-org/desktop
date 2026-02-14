## ADDED Requirements

### Requirement: 一次性依赖安装流程

应用 MUST 支持通过单次调用安装某个版本的所有必需依赖，而不是对每个依赖项单独触发安装。

#### Scenario: 单次调用安装所有依赖

**Given** 用户触发版本切换操作
**When** 应用检测到该版本的依赖未安装
**Then** 应用执行单次依赖安装调用
**And** 该调用安装该版本的所有必需依赖项
**And** 用户只看到一次安装进度提示

#### Scenario: 安装进度实时反馈

**Given** 应用正在执行一次性依赖安装
**When** 安装过程中依赖项状态发生变化
**Then** 应用实时更新安装进度
**And** 显示当前正在安装的依赖项名称
**And** 显示总体安装进度百分比

#### Scenario: 部分安装失败继续处理

**Given** 一次性依赖安装过程中某个依赖项安装失败
**When** 其他依赖项可以独立安装
**Then** 应用继续安装剩余依赖项
**And** 在最终结果中明确标识失败的依赖项
**And** 提供针对性的重试选项

---

## MODIFIED Requirements

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
