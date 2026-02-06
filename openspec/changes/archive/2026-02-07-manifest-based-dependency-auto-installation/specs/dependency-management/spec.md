## ADDED Requirements

### Requirement: 基于 Manifest 的依赖安装

系统 SHALL 支持从 NORT 包的 Manifest 文件读取依赖安装命令，并执行安装操作。

#### Scenario: 包安装完成后自动检查依赖

- **WHEN** NORT 包安装完成
- **THEN** 系统应自动读取已安装包的 Manifest 文件
- **AND** 系统应解析 Manifest 中的依赖声明
- **AND** 系统应检查每个依赖的安装状态
- **AND** 如果检测到缺失依赖，系统应显示安装确认对话框

#### Scenario: 用户确认后执行依赖安装

- **WHEN** 用户在依赖安装确认对话框中点击"安装依赖"按钮
- **THEN** 系统应遍历所有缺失的依赖项
- **AND** 对于每个依赖，系统应从 Manifest 中读取对应的安装命令
- **AND** 系统应按平台匹配安装命令（Windows/macOS/Linux）
- **AND** 系统应执行安装命令并跟踪进度
- **AND** 系统应在安装完成后自动刷新依赖状态

#### Scenario: 读取 Manifest 中的安装命令

- **WHEN** 系统读取 Manifest 文件中的依赖信息
- **THEN** 系统应解析每个依赖的 `installCommand` 字段
- **AND** 如果 `installCommand` 是对象格式，系统应根据当前平台选择对应的命令
- **AND** 如果 `installCommand` 是字符串格式，系统应直接使用该命令
- **AND** 如果 `installCommand` 不存在，系统应标记该依赖为"不可自动安装"

#### Scenario: 区域检测和命令选择

- **GIVEN** 用户系统的 locale 是 `zh-CN`
- **WHEN** 系统解析依赖的 `installCommand`
- **THEN** 系统应优先使用 `china` 区域的命令
- **AND** 如果 `china` 命令不存在，系统应使用 `global` 命令

- **GIVEN** 用户系统的时区是 `Asia/Shanghai` 或 `Asia/Hong_Kong`
- **WHEN** 系统解析依赖的 `installCommand`
- **THEN** 系统应优先使用 `china` 区域的命令
- **AND** 如果 `china` 命令不存在，系统应使用 `global` 命令

- **GIVEN** 用户系统的 locale 和时区都不符合中国区域
- **WHEN** 系统解析依赖的 `installCommand`
- **THEN** 系统应使用 `global` 区域的命令

- **GIVEN** 依赖的 `installCommand` 包含 `isRegional: true` 标志
- **WHEN** 系统解析该依赖
- **THEN** 系统应根据区域检测结果选择 `china` 或 `global` 命令

#### Scenario: 平台和区域嵌套命令匹配

- **GIVEN** 当前操作系统是 Linux
- **AND** `installCommand` 结构为 `{ linux: { china: "...", global: "..." } }`
- **WHEN** 系统解析依赖的 `installCommand` 对象
- **THEN** 系统应首先匹配 `linux` 平台
- **AND** 然后根据区域检测结果选择 `linux.china` 或 `linux.global`

- **GIVEN** 当前操作系统是 Windows
- **AND** `installCommand` 结构为 `{ windows: { china: "...", global: "..." } }`
- **WHEN** 系统解析依赖的 `installCommand` 对象
- **THEN** 系统应首先匹配 `windows` 平台
- **AND** 然后根据区域检测结果选择 `windows.china` 或 `windows.global`

- **GIVEN** 当前操作系统是 macOS
- **AND** `installCommand` 结构为 `{ macos: { china: "...", global: "..." } }`
- **WHEN** 系统解析依赖的 `installCommand` 对象
- **THEN** 系统应首先匹配 `macos` 平台
- **AND** 然后根据区域检测结果选择 `macos.china` 或 `macos.global`

#### Scenario: 简单区域命令结构（无平台嵌套）

- **GIVEN** `installCommand` 结构为 `{ china: "...", global: "...", isRegional: true }`
- **WHEN** 系统解析依赖的 `installCommand` 对象
- **THEN** 系统应忽略平台判断
- **AND** 系统应根据区域检测结果直接选择 `china` 或 `global` 命令

#### Scenario: 只有 installHint 的情况

- **GIVEN** 依赖没有 `installCommand` 字段
- **AND** 依赖有 `installHint` 字段
- **WHEN** 系统解析该依赖
- **THEN** 系统应标记该依赖为"需手动安装"
- **AND** UI 应显示 `installHint` 内容作为手动安装指引
- **AND** UI 应提供"访问官网"按钮（如果 `installHint` 包含 URL）

#### Scenario: 依赖安装进度跟踪

- **WHEN** 系统执行依赖安装
- **THEN** 系统应显示实时安装进度
- **AND** 进度信息应包含：当前安装项、总安装项数、当前依赖名称
- **AND** 系统应在每个依赖安装完成后更新进度
- **AND** 系统应显示当前安装阶段（下载、安装、验证）

#### Scenario: 依赖安装错误处理

- **WHEN** 某个依赖安装失败
- **THEN** 系统应记录错误信息
- **AND** 系统应继续安装剩余的依赖项
- **AND** 系统应在最终结果中列出成功和失败的依赖
- **AND** 系统应为失败的依赖提供重试选项

#### Scenario: 依赖安装权限处理

- **WHEN** 安装命令因权限不足而失败
- **THEN** 系统应显示友好的权限错误提示
- **AND** 提示应说明需要管理员权限
- **AND** 提示应提供两种选项：以管理员身份重试、手动安装指引

---

### Requirement: 依赖管理页面手动安装

系统 SHALL 在依赖管理页面为每个缺失的依赖项提供"安装"按钮，允许用户手动触发单个依赖的安装。

#### Scenario: 显示依赖安装按钮

- **WHEN** 渲染依赖管理面板
- **AND** 某个依赖项的状态为"未安装"或"版本不匹配"
- **THEN** 系统应在该依赖项的操作列显示"安装"按钮
- **AND** 如果依赖有 `installCommand`，按钮应处于启用状态
- **AND** 如果依赖没有 `installCommand`，按钮应处于禁用状态
- **AND** 系统应始终显示"访问官网"按钮作为备选

#### Scenario: 点击安装按钮执行单个依赖安装

- **WHEN** 用户点击某个依赖的"安装"按钮
- **THEN** 系统应从 Manifest 中读取该依赖的安装命令
- **AND** 系统应执行安装命令
- **AND** 系统应显示安装进度指示器
- **AND** 按钮文本应变为"安装中..."
- **AND** 按钮应处于禁用状态

#### Scenario: 单个依赖安装完成

- **WHEN** 单个依赖安装成功
- **THEN** 系统应自动刷新该依赖的状态
- **AND** 状态应更新为"已安装"
- **AND** 操作列应移除"安装"按钮
- **AND** 系统应显示安装成功提示

#### Scenario: 单个依赖安装失败

- **WHEN** 单个依赖安装失败
- **THEN** 系统应显示错误提示
- **AND** 错误提示应包含失败原因
- **AND** "安装"按钮应变为"重试"按钮
- **AND** 系统应保留"访问官网"按钮供用户手动安装

---

### Requirement: 依赖安装状态管理

系统 SHALL 提供依赖安装过程中的状态管理，包括确认对话框状态、安装进度和错误信息。

#### Scenario: 显示依赖安装确认对话框

- **WHEN** 包安装完成且检测到缺失依赖
- **THEN** Redux store 应更新 `installConfirm.show` 状态为 `true`
- **AND** Redux store 应保存 `installConfirm.dependencies` 为缺失依赖列表
- **AND** Redux store 应保存 `installConfirm.manifestPath` 为 Manifest 文件路径

#### Scenario: 隐藏依赖安装确认对话框

- **WHEN** 用户点击"取消"按钮或安装完成
- **THEN** Redux store 应更新 `installConfirm.show` 状态为 `false`
- **AND** Redux store 应清除 `installConfirm.dependencies` 和 `installConfirm.manifestPath`

#### Scenario: 更新依赖安装进度

- **WHEN** 系统正在安装依赖
- **THEN** Redux store 应更新 `installProgress.installing` 为 `true`
- **AND** Redux store 应更新 `installProgress.current` 为当前安装项索引
- **AND** Redux store 应更新 `installProgress.total` 为总安装项数
- **AND** Redux store 应更新 `installProgress.currentDependency` 为当前依赖名称

#### Scenario: 记录依赖安装错误

- **WHEN** 某个依赖安装失败
- **THEN** Redux store 应在 `installProgress.errors` 数组中添加错误记录
- **AND** 错误记录应包含依赖名称和错误信息
- **AND** UI 应显示失败的依赖列表和对应的错误信息

---

## MODIFIED Requirements

### Requirement: 依赖状态可视化

应用 MUST 在依赖管理面板中以清晰直观的方式展示依赖状态，包括安装状态、版本信息和可用操作。

#### Scenario: 显示未安装的依赖

- **GIVEN** 依赖未安装
- **WHEN** 渲染依赖管理面板
- **THEN** 显示红色 ❌ 图标
- **AND** 显示"未安装"状态文本
- **AND** 显示要求的版本范围
- **AND** 如果依赖有 `installCommand`，显示"安装"按钮
- **AND** 始终显示"访问官网"按钮作为备选
- **AND** 如果 `installCommand` 不可用，"安装"按钮应处于禁用状态

#### Scenario: 显示版本不匹配的依赖

- **GIVEN** 依赖已安装但版本低于要求
- **WHEN** 渲染依赖管理面板
- **THEN** 显示黄色 ⚠️ 图标
- **AND** 显示"版本不匹配"状态文本
- **AND** 显示当前版本和要求的版本范围
- **AND** 如果依赖有 `installCommand`，显示"升级"按钮
- **AND** 始终显示"访问官网"按钮作为备选

---

### Requirement: 错误处理和用户反馈

应用 MUST 在依赖检测或安装失败时提供清晰的错误信息和恢复建议。

#### Scenario: 安装命令执行失败（权限不足）

- **GIVEN** 用户点击"使用包管理器安装"或 Manifest 定义的安装命令
- **WHEN** 安装命令因权限不足而失败
- **THEN** 显示错误提示："需要管理员权限"
- **AND** 提示用户以管理员身份运行应用或手动安装
- **AND** 如果是手动安装操作，提供"重试"按钮
- **AND** 提供"访问官网下载"按钮作为备选

#### Scenario: 安装命令执行失败（网络错误）

- **GIVEN** 用户点击"安装"按钮执行 NPM 包安装
- **WHEN** 安装命令因网络不可用而失败
- **THEN** 显示错误提示："网络连接失败"
- **AND** 建议用户检查网络连接
- **AND** 提供"重试"按钮
- **AND** 提供"访问官网下载"按钮作为备选

#### Scenario: 安装命令执行失败（命令不存在）

- **GIVEN** 用户点击"安装"按钮
- **WHEN** 安装命令因包管理器不存在而失败
- **THEN** 显示错误提示："包管理器不可用"
- **AND** 提示用户安装对应的包管理器或使用手动安装
- **AND** 提供"访问官网下载"按钮作为备选

#### Scenario: 部分依赖安装失败

- **GIVEN** 系统正在安装多个依赖
- **WHEN** 部分依赖安装成功、部分失败
- **THEN** 显示部分成功提示："X 个依赖安装成功，Y 个失败"
- **AND** 列出成功安装的依赖项
- **AND** 列出安装失败的依赖项及错误原因
- **AND** 为失败的依赖提供"重试"按钮
