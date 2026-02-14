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

#### Scenario: 从多路径读取脚本执行结果

**Given** EntryPoint 脚本执行完成并生成结果文件
**When** DependencyManager 读取结果文件
**Then** 首先在工作目录搜索结果文件
**And** 如果未找到，在 Scripts 子目录中搜索
**And** 如果仍未找到，在脚本所在目录搜索
**And** 成功读取结果文件并解析依赖状态

#### Scenario: 脚本结果文件在工作目录

**Given** EntryPoint 脚本将结果文件写入工作目录
**When** DependencyManager 读取结果文件
**Then** 从工作目录成功读取 result.json
**And** 解析依赖状态并返回正确结果

#### Scenario: 脚本结果文件在 Scripts 子目录

**Given** EntryPoint 脚本将结果文件写入工作目录/Scripts 子目录
**When** DependencyManager 读取结果文件
**Then** 从工作目录搜索失败后，在 Scripts 子目录成功读取
**And** 解析依赖状态并返回正确结果

#### Scenario: 脚本结果文件在脚本所在目录

**Given** EntryPoint 脚本将结果文件写入脚本自身所在目录
**When** DependencyManager 读取结果文件
**Then** 从工作目录和 Scripts 子目录搜索失败后，在脚本所在目录成功读取
**And** 解析依赖状态并返回正确结果

---

## ADDED Requirements

### Requirement: 结果文件多路径搜索

应用 MUST 支持从多个可能的位置读取 EntryPoint 脚本执行结果文件，以适应不同的脚本行为。

#### Scenario: 支持多种结果文件位置

**Given** EntryPoint 脚本执行完成
**When** 脚本可能将结果文件写入以下任一位置：
  - 工作目录（安装目录）
  - 工作目录/Scripts 子目录
  - 脚本所在目录
**Then** DependencyManager 按优先级顺序搜索所有位置
**And** 找到结果文件后立即返回，不再继续搜索

#### Scenario: 保持向后兼容性

**Given** 现有脚本将结果文件写入工作目录
**When** DependencyManager 搜索结果文件
**Then** 优先从工作目录搜索（保持原有行为）
**And** 不影响现有脚本的正常工作

#### Scenario: 详细日志记录搜索过程

**Given** DependencyManager 搜索结果文件
**When** 在每个位置尝试读取
**Then** 记录搜索路径和尝试结果
**And** 成功读取时记录文件路径
**And** 未找到任何文件时记录警告信息
