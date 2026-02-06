# i18n 国际化翻译覆盖能力规范

本文档定义了完善 Hagicode Desktop 应用国际化翻译覆盖的功能需求。

---

## ADDED Requirements

### Requirement: 应用核心文本国际化

应用程序的所有用户可见文本 **MUST** 通过 i18next 翻译函数获取，支持在简体中文和英文之间切换。

#### Scenario: 用户查看远程服务器状态卡片

**Given** 用户已启动应用并选择"简体中文"作为界面语言
**When** 用户查看"远程服务器状态"卡片
**Then** 卡片标题应显示为"远程服务器状态"（而非"Remote Server Status"）
**And** 状态描述应显示中文（如"远程服务器正在运行"）
**And** 操作按钮应显示中文（如"启动远程服务器"、"停止远程服务器"）

#### Scenario: 用户切换语言

**Given** 应用当前显示为简体中文
**When** 用户在设置中将语言切换为"English"
**Then** 所有界面文本应立即更新为英文
**And** 包括卡片标题、状态描述、按钮文本等所有元素
**And** 无任何硬编码的中文或英文文本可见

#### Scenario: 用户在不同状态下查看服务器状态

**Given** 用户已选择界面语言（中文或英文）
**When** 远程服务器状态为"运行中"、"已停止"或"错误"
**Then** 状态文本应正确显示为对应语言的翻译
**And** 状态描述文本应正确翻译（如"Remote server is operational"对应"远程服务器正在运行"）

---

### Requirement: UI 组件库无障碍文本国际化

shadcn/ui 组件库中的无障碍文本（如屏幕阅读器文本）**MUST** 支持国际化。

#### Scenario: 屏幕阅读器用户使用对话框关闭按钮

**Given** 用户使用屏幕阅读器辅助技术
**And** 用户已选择简体中文界面
**When** 用户聚焦于对话框的关闭按钮
**Then** 屏幕阅读器应朗读"关闭"（而非"Close"）

#### Scenario: 屏幕阅读器用户使用英文界面

**Given** 用户使用屏幕阅读器辅助技术
**And** 用户已选择英文界面
**When** 用户聚焦于对话框的关闭按钮
**Then** 屏幕阅读器应朗读"Close"

---

### Requirement: 翻译资源完整性

所有命名空间的翻译资源文件 **MUST** 在中英文版本之间保持键结构完全一致。

#### Scenario: 系统验证翻译文件一致性

**Given** 开发者运行翻译文件一致性检查
**When** 比较 `zh-CN/common.json` 和 `en-US/common.json`
**Then** 两个文件的键结构应完全相同（仅翻译值不同）
**And** diff 工具应仅显示值差异，无键缺失或多余

#### Scenario: 应用运行时查找翻译键

**Given** 应用正在运行
**When** 代码调用 `t('common.remoteServer.title')`
**Then** 无论当前语言是中文还是英文，都应成功找到对应的翻译值
**And** 不应触发 `missingKeyHandler` 警告

---

### Requirement: UI 组件翻译命名空间

**SHALL** 创建独立的 `ui` 命名空间用于管理 UI 组件库的翻译资源。

#### Scenario: UI 组件使用独立的翻译命名空间

**Given** 开发者在代码中导入 `useTranslation`
**When** Dialog 组件需要获取关闭按钮的无障碍文本
**Then** 组件应使用 `useTranslation('ui')` 或包含 `'ui'` 命名空间
**And** 通过 `t('ui.dialog.close')` 获取翻译

#### Scenario: i18n 配置包含 ui 命名空间

**Given** 应用启动并初始化 i18next
**When** 加载翻译资源
**Then** `i18nConfig.ns` 数组应包含 `'ui'` 命名空间
**And** 系统应成功加载 `locales/{language}/ui.json` 文件

---

## MODIFIED Requirements

### Requirement: i18n 配置扩展

现有的 i18n 配置 **MUST** 扩展以支持新的命名空间。

**变更前**: `ns: ['common', 'components', 'pages']`
**变更后**: `ns: ['common', 'components', 'pages', 'ui']`

#### Scenario: 应用启动时加载所有命名空间

**Given** 应用正在启动
**When** i18next 初始化
**Then** 系统应加载四个命名空间：common, components, pages, ui
**And** 每个命名空间都应成功加载中英文翻译资源

#### Scenario: 组件声明所需命名空间

**Given** 组件需要使用多个命名空间的翻译
**When** 组件调用 `useTranslation(['common', 'components', 'ui'])`
**Then** 所有请求的命名空间都应成功加载
**And** 组件可以访问所有命名空间的翻译键

---

## REMOVED Requirements

无移除的需求。

---

## RENAMED Requirements

无重命名的需求。

---

## 非功能性需求

### 性能要求

- 翻译函数调用不应影响应用性能
- 语言切换应在 100ms 内完成所有界面更新

### 可维护性要求

- 翻译键命名应遵循一致的约定（`namespace:category.item`）
- 新增翻译时必须同时在所有语言版本中添加键
- 避免翻译键层级过深（最多 3 层）

### 兼容性要求

- 现有的翻译键命名和结构应保持向后兼容
- 不应破坏现有的语言切换功能

---

## 验收标准

### 功能验收

- [ ] App.tsx 中所有用户可见文本使用 `t()` 函数
- [ ] Dialog 等组件的 `sr-only` 文本已国际化
- [ ] 创建了 `ui.json` 翻译文件
- [ ] i18n 配置已更新包含 `ui` 命名空间
- [ ] 切换语言后所有文本正确更新

### 质量验收

- [ ] 控制台无 "Missing translation key" 警告
- [ ] 中英文翻译文件键结构一致（diff 验证通过）
- [ ] TypeScript 类型检查无错误
- [ ] 现有功能（启动/停止服务、包管理等）不受影响

### 用户体验验收

- [ ] 界面无任何硬编码的中英文文本
- [ ] 屏幕阅读器能正确朗读本地化的无障碍文本
- [ ] 语言切换流畅，无闪烁或延迟
