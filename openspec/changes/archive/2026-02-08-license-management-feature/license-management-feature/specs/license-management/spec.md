## ADDED Requirements

### Requirement: 配置管理器集成
系统 SHALL 将许可证配置集成到现有的 ConfigManager 中，与其他应用配置统一管理。

#### Scenario: 扩展 AppConfig 接口
- **WHEN** 定义应用配置接口时
- **THEN** 系统应在 `AppConfig` 接口中添加 `license` 字段
- **AND** 定义 `LicenseConfig` 接口包含 licenseKey、isConfigured、updatedAt
- **AND** 在默认配置中包含默认许可证配置

#### Scenario: ConfigManager 提供许可证方法
- **WHEN** 需要访问许可证配置时
- **THEN** ConfigManager 应提供 `getLicense()` 方法
- **AND** ConfigManager 应提供 `setLicense(licenseKey)` 方法
- **AND** 这些方法应使用 electron-store 持久化许可证数据

### Requirement: 应用启动时许可证初始化
系统 SHALL 在应用启动时自动初始化许可证配置。

#### Scenario: 首次启动自动配置默认许可证
- **WHEN** 系统首次启动且无许可证配置时
- **THEN** 系统应在 ConfigManager 初始化后检查许可证
- **AND** 如果许可证不存在，自动设置默认许可证密钥：`D76B5C-EC0A70-AEA453-BC9414-0A198D-V3`
- **AND** 标记许可证为已配置状态
- **AND** 记录初始化日志

#### Scenario: 后续启动加载已有许可证
- **WHEN** 系统启动且许可证配置已存在时
- **THEN** 系统应从 ConfigManager 加载现有许可证
- **AND** 许可证管理器应正确获取已保存的许可证

### Requirement: 全局许可证数据存储
系统 SHALL 提供极简的全局许可证数据存储机制，用于管理单一的全局许可证配置，该许可证适用于所有已安装的软件版本。

#### Scenario: 保存全局许可证
- **WHEN** 用户保存许可证密钥时
- **THEN** 系统应通过 ConfigManager 将许可证数据持久化存储到 electron-store
- **AND** 存储的数据应包含许可证密钥、配置状态和更新时间
- **AND** 只允许存在一个全局许可证配置

#### Scenario: 读取全局许可证
- **WHEN** 用户访问许可证管理页面时
- **THEN** 系统应通过 LicenseManager 从 ConfigManager 读取当前的全局许可证配置
- **AND** 如果不存在许可证，应返回 null
- **AND** 如果存在许可证，应返回完整的许可证数据

### Requirement: 极简的许可证管理界面
系统 SHALL 提供极简的单一文本框界面，用于查看和更新全局许可证。

#### Scenario: 显示当前许可证状态
- **WHEN** 用户访问许可证管理页面
- **THEN** 系统应显示当前许可证的状态卡片
- **AND** 卡片应显示许可证配置状态
- **AND** 卡片应显示许可证密钥（部分隐藏显示）
- **AND** 卡片应显示许可证适用于所有版本的说明
- **AND** 如果未配置，应显示未配置状态

#### Scenario: 更新许可证
- **WHEN** 用户在文本框中输入许可证密钥并提交
- **THEN** 系统应保存许可证数据
- **AND** 显示成功提示

#### Scenario: 预填充默认许可证
- **WHEN** 用户访问许可证管理页面且未修改过许可证
- **THEN** 输入框应预填充默认许可证密钥：`D76B5C-EC0A70-AEA453-BC9414-0A198D-V3`

### Requirement: 极简的 IPC 通信接口
系统 SHALL 通过 IPC 提供极简的许可证管理 API。

#### Scenario: 获取当前许可证
- **WHEN** 渲染进程调用 `license:get` IPC 接口
- **THEN** 主进程应返回当前的全局许可证配置
- **AND** 如果不存在，应返回 null
- **AND** 如果发生错误，应返回错误信息

#### Scenario: 保存许可证
- **WHEN** 渲染进程调用 `license:save` IPC 接口并传入许可证密钥
- **THEN** 主进程应保存许可证数据
- **AND** 返回保存结果

### Requirement: 极简的状态管理
系统 SHALL 使用 Redux Toolkit 和 Redux Saga 管理极简的许可证应用状态。

#### Scenario: 获取许可证状态
- **WHEN** 许可证页面加载时
- **THEN** 系统 dispatch `FETCH_LICENSE` action
- **AND** Saga 监听该 action 并调用 IPC 接口获取数据
- **AND** 成功后 dispatch `setLicense` action 更新状态

#### Scenario: 保存许可证状态
- **WHEN** 用户提交许可证密钥时
- **THEN** 系统 dispatch `SAVE_LICENSE` action 并携带许可证密钥
- **AND** Saga 监听该 action 并调用 IPC 接口保存数据
- **AND** 成功后 dispatch `setLicense` action 更新状态
- **AND** 显示 Toast 提示

#### Scenario: 加载和错误状态
- **WHEN** 许可证操作进行中时
- **THEN** 系统应设置 loading 状态为 true
- **AND** 操作完成后，loading 状态应设置为 false
- **AND** 如果发生错误，应设置 error 状态并显示错误提示

### Requirement: 国际化支持
系统 SHALL 为极简的许可证管理功能提供中英文双语支持。

#### Scenario: 中文界面
- **WHEN** 用户选择中文语言
- **THEN** 许可证管理页面的所有文本应显示为中文
- **AND** 包括菜单项、状态文本、输入框标签、提示信息

#### Scenario: 英文界面
- **WHEN** 用户选择英文语言
- **THEN** 许可证管理页面的所有文本应显示为英文
- **AND** 包括菜单项、状态文本、输入框标签、提示信息

### Requirement: 侧边栏导航集成
系统 SHALL 在侧边栏导航中添加「许可证管理」菜单项。

#### Scenario: 显示许可证管理菜单项
- **WHEN** 用户查看侧边栏导航
- **THEN** 导航列表中应包含「许可证管理」菜单项
- **AND** 菜单项应显示 Key 图标
- **AND** 菜单项文本应根据当前语言显示

#### Scenario: 导航到许可证管理页面
- **WHEN** 用户点击「许可证管理」菜单项
- **THEN** 系统应切换到许可证管理视图
- **AND** 菜单项应显示为激活状态
- **AND** URL 或路由状态应更新

### Requirement: 极简的表单验证
系统 SHALL 对许可证输入进行基本验证。

#### Scenario: 验证必填字段
- **WHEN** 用户提交空许可证密钥时
- **THEN** 系统应显示错误提示并阻止提交
- **AND** 高亮输入框提示用户输入
