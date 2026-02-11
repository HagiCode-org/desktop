# dependency-management Specification Delta

## MODIFIED Requirements

### Requirement: 依赖状态检测

应用 MUST 能够自动检测主机是否安装了 Web 服务所需的运行时依赖项，并报告详细的版本信息。依赖项元数据 MUST 从已安装版本的 Manifest 文件中读取。

#### Scenario: 应用启动时自动检测依赖

**Given** 应用启动
**When** 主窗口加载完成
**And** 存在已安装版本且包含有效的 manifest.json
**Then** 应用从 manifest.json 读取依赖项配置
**And** 应用自动检测所有配置的依赖项
**And** 检测结果在 3 秒内返回
**And** 依赖状态展示在依赖管理面板中

#### Scenario: 从 Manifest 读取依赖项元数据

**Given** 已安装版本包含 manifest.json
**When** 应用读取依赖项配置
**Then** 从 `manifest.dependencies` 字段读取所有依赖项
**And** 每个依赖项包含：version、installCommand、checkCommand、type、description
**And** 依赖项名称从依赖键格式化生成
**And** 跳过 type 为 `system-requirement` 的依赖项

#### Scenario: Manifest 缺失时的降级行为

**Given** 已安装版本不存在或 manifest.json 损坏
**When** 应用尝试读取依赖项配置
**Then** 应用使用硬编码的默认依赖项（仅 .NET Runtime）
**And** 记录警告日志
**And** 显示降级模式提示给用户

---

### Requirement: 依赖安装引导

应用 MUST 为缺失的依赖项提供便捷的安装方式，使用 Manifest 中定义的安装命令。

#### Scenario: 使用 Manifest 定义的命令安装 NPM 依赖

**Given** NPM 依赖未安装（如 claudeCode）
**And** manifest.json 中定义了该依赖的 installCommand
**When** 用户点击"安装"按钮
**Then** 应用从 installCommand 解析安装命令
**And** 根据用户区域选择正确的命令变体（china/global）
**And** 执行解析后的安装命令
**And** 显示安装进度提示
**And** 安装完成后自动刷新依赖状态

#### Scenario: 处理区域化的安装命令

**Given** 依赖的 installCommand 为对象格式
**And** 对象包含 china 和 global 两个命令
**When** 用户位于中国区域
**Then** 应用使用 china 命令（通常使用国内镜像）
**When** 用户位于国际区域
**Then** 应用使用 global 命令（使用官方源）

#### Scenario: 处理平台特定的安装命令

**Given** 依赖的 installCommand 为平台嵌套格式
**And** 对象包含 windows、macos、linux 的子对象
**When** 应用运行在 Windows 平台
**Then** 应用使用 windows 子对象中的命令
**And** 根据用户区域选择 china 或 global 变体

---

### Requirement: 依赖类型可扩展性

应用架构 MUST 支持通过 Manifest 文件便捷地添加新的依赖类型，无需修改代码。

#### Scenario: 通过 Manifest 添加新的依赖类型

**Given** 需要添加新的依赖项（如 Node.js）
**When** 开发者在 manifest.json 的 dependencies 中添加新条目
**And** 定义该依赖的 checkCommand、installCommand、type、description
**Then** 应用自动检测新依赖项
**And** 在面板中显示新依赖项状态
**And** 提供相应的安装引导
**And** 无需修改任何代码

#### Scenario: 依赖项键命名约定

**Given** Manifest 中定义依赖项
**When** 依赖项键为 camelCase 格式（如 claudeCode、openspec）
**Then** 应用将键转换为显示名称（Claude Code、OpenSpec）
**And** 转换规则：在大写字母前插入空格并首字母大写
