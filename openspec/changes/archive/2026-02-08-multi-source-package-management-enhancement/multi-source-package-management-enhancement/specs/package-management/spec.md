# package-management Specification Delta

## ADDED Requirements

### Requirement: 包源选择器 UI 组件

应用 MUST 提供包源选择器 UI 组件，允许用户在不同的包源类型之间切换。

#### Scenario: 显示包源选择器

**Given** 用户打开包管理界面
**When** 界面加载完成
**Then** 显示包源选择器组件
**And** 选择器包含两个选项："Local Folder" 和 "GitHub Releases"
**And** 默认选中 "Local Folder" 选项
**And** 选择器使用 shadcn/ui 的 Select 组件实现

#### Scenario: 切换包源类型

**Given** 用户在包管理界面
**When** 用户点击包源选择器并选择不同的源类型
**Then** 界面显示对应的配置表单
**And** 之前输入的配置被保留（切换回来时恢复）
**And** 可用版本列表被清空
**And** 安装按钮被禁用

---

### Requirement: 本地文件夹源配置

应用 MUST 允许用户配置本地文件夹作为包源，并验证路径的有效性。

#### Scenario: 配置本地文件夹路径

**Given** 用户选择本地文件夹源
**When** 用户在路径输入框中输入文件夹路径
**And** 用户点击 "Scan Available Versions" 按钮
**Then** 应用验证路径是否存在
**And** 验证路径是否为目录
**And** 验证应用是否有读取权限
**And** 如果验证通过，扫描文件夹中的 .zip 文件
**And** 从文件名解析版本信息并显示在版本列表中

#### Scenario: 使用文件夹浏览器选择路径

**Given** 用户选择本地文件夹源
**When** 用户点击 "Browse" 按钮
**Then** 打开系统文件夹选择对话框
**And** 用户选择文件夹后，路径自动填充到输入框
**And** 自动触发路径验证

#### Scenario: 路径验证失败

**Given** 用户选择本地文件夹源
**When** 用户输入的路径不存在或无法访问
**Then** 在路径输入框下方显示错误消息
**And** 错误消息包含具体的失败原因
**And** "Scan Available Versions" 按钮被禁用
**And** 错误消息使用警告样式（红色文本）

#### Scenario: 持久化文件夹路径配置

**Given** 用户成功配置了本地文件夹路径
**And** 用户扫描了可用版本
**When** 用户重启应用
**Then** 应用从 electron-store 加载上次的文件夹路径配置
**And** 路径自动填充到输入框
**And** 用户可以直接点击扫描按钮获取版本列表

---

### Requirement: GitHub Releases 源配置

应用 MUST 允许用户配置 GitHub Releases 作为包源，并支持可选的认证 Token。

#### Scenario: 配置 GitHub 仓库

**Given** 用户选择 GitHub Releases 源
**When** 界面显示 GitHub 配置表单
**Then** 显示 "Repository Owner" 输入框（默认值：HagiCode-org）
**And** 显示 "Repository Name" 输入框（默认值：releases）
**And** 显示 "Auth Token (Optional)" 输入框
**And** 显示 "Fetch from GitHub" 按钮
**And** Token 输入框默认隐藏输入内容（密码类型）

#### Scenario: 获取 GitHub Releases 版本列表

**Given** 用户配置了 GitHub 仓库信息
**When** 用户点击 "Fetch from GitHub" 按钮
**Then** 应用向 GitHub API 发送请求
**And** 请求地址为 `https://api.github.com/repos/{owner}/{repo}/releases`
**And** 如果提供了 Token，在请求头中包含认证信息
**And** 解析返回的 Release 列表
**And** 过滤出文件名匹配 nort 包格式的资产
**And** 从 Release 中提取版本号、发布日期、文件大小
**And** 在版本列表中显示匹配当前平台的版本

#### Scenario: 使用 GitHub Token 认证

**Given** 用户选择 GitHub Releases 源
**When** 用户在 Token 输入框中输入 GitHub Personal Access Token
**And** 用户点击 "Fetch from GitHub" 按钮
**Then** 应用在 API 请求中包含认证头：`Authorization: token {token}`
**And** 应用能访问私有仓库的 Release
**And** API 速率限制提升到 5000 次/小时
**And** Token 被安全存储（加密保存到 electron-store）
**And** Token 不被记录到日志

#### Scenario: GitHub Token 可视化切换

**Given** 用户在 Token 输入框中输入了 Token
**When** 用户点击 "Show/Hide" 按钮
**Then** Token 内容在明文和遮盖之间切换
**And** 遮盖状态显示为 `•••••••••••••••••••••••••••••••`
**And** 明文状态显示完整的 Token 值
**And** 切换状态不改变 Token 的实际值

#### Scenario: 处理 GitHub API 速率限制

**Given** 用户频繁调用 GitHub API 且未提供 Token
**When** API 返回 403 状态码和速率限制头
**Then** 应用解析 `X-RateLimit-Remaining` 和 `X-RateLimit-Reset` 头
**And** 显示友好的速率限制对话框
**And** 对话框说明当前限制（60 次/小时）和重置时间
**And** 提示用户提供认证 Token 以提高限制
**And** 提供 "Learn more" 链接到 GitHub Token 文档
**And** 提供 "Close" 按钮关闭对话框

#### Scenario: 处理 GitHub API 网络错误

**Given** 用户正在从 GitHub 获取版本列表
**When** 网络连接中断或请求超时
**Then** 显示网络错误对话框
**And** 错误消息包含具体的失败原因（如 ETIMEDOUT）
**And** 提供 "Retry" 按钮重新尝试
**And** 提供 "Cancel" 按钮取消操作
**And** 在控制台记录详细的错误日志

---

### Requirement: 版本信息缓存

应用 MUST 缓存从 GitHub API 获取的版本信息，以减少 API 调用并提升性能。

#### Scenario: 缓存 GitHub 版本信息

**Given** 用户成功从 GitHub 获取了版本列表
**When** 获取操作完成
**Then** 应用将版本信息缓存到内存
**And** 缓存键为 `github:{owner}:{repo}`
**And** 缓存时长为 1 小时
**And** 缓存内容包括版本列表、Release 信息、资产信息

#### Scenario: 使用缓存的版本信息

**Given** 用户之前已经获取过 GitHub 版本列表
**And** 缓存未过期（距离上次获取不到 1 小时）
**When** 用户再次点击 "Fetch from GitHub" 按钮
**Then** 应用直接从缓存返回版本列表
**And** 不发起 GitHub API 请求
**And** 在 UI 中提示"使用缓存数据"

#### Scenario: 缓存过期后重新获取

**Given** 用户之前已经获取过 GitHub 版本列表
**And** 缓存已过期（距离上次获取超过 1 小时）
**When** 用户再次点击 "Fetch from GitHub" 按钮
**Then** 应用忽略缓存
**And** 发起新的 GitHub API 请求
**And** 更新缓存内容

---

### Requirement: 包源配置持久化

应用 MUST 将用户的包源配置持久化存储，并在应用重启后恢复。

#### Scenario: 保存包源配置

**Given** 用户配置了包源（本地文件夹或 GitHub Releases）
**And** 用户成功获取了版本列表
**When** 配置操作完成
**Then** 应用将配置保存到 electron-store
**And** 配置键为 `packageSource.config`
**And** 配置包含源类型和对应的配置参数

#### Scenario: 恢复包源配置

**Given** 用户之前已经配置了包源
**When** 用户重启应用并打开包管理界面
**Then** 应用从 electron-store 加载包源配置
**And** 根据配置类型显示对应的表单
**And** 表单字段自动填充保存的值
**And** Token 字段填充遮盖值（`•••••••••••••••••••••••••••••••`）

#### Scenario: 清除包源配置

**Given** 用户想要重置包源配置
**When** 用户点击配置表单的 "Clear" 按钮
**Then** 应用清除 electron-store 中的包源配置
**And** 表单字段恢复默认值
**And** 版本列表被清空

---

### Requirement: 包源配置错误处理

应用 MUST 提供清晰的错误提示和恢复机制，处理各种包源配置错误。

#### Scenario: 文件夹路径不存在

**Given** 用户输入了本地文件夹路径
**When** 路径不存在
**Then** 在路径输入框下方显示错误消息
**And** 错误消息："This path does not exist or is not accessible"
**And** "Scan Available Versions" 按钮被禁用
**And** 错误消息使用警告样式

#### Scenario: GitHub 仓库无效

**Given** 用户输入了 GitHub 仓库信息
**When** 仓库不存在或用户无权访问
**Then** 显示错误对话框
**And** 错误消息："Failed to access repository. Please check the owner and repo name."
**And** 如果是认证问题，提示检查 Token
**And** 提供 "OK" 按钮关闭对话框

#### Scenario: GitHub Release 中无 nort 包

**Given** 用户成功连接到 GitHub 仓库
**When** Release 中没有文件名匹配 nort 包格式的资产
**Then** 显示提示消息
**And** 消息内容："No nort packages found in this repository"
**And** 版本列表为空
**And** 安装按钮被禁用

---

### Requirement: 包源状态管理

应用 MUST 使用 Redux 管理包源相关的状态，包括配置、版本列表、加载状态和错误信息。

#### Scenario: 更新包源配置状态

**Given** 用户修改了包源配置
**When** 配置验证通过
**Then** Redux store 更新 `currentConfig` 状态
**And** 清空 `availableVersions` 状态
**And** 清空 `error` 状态
**And** UI 组件重新渲染反映新状态

#### Scenario: 设置加载状态

**Given** 用户点击获取版本列表按钮
**When** 异步操作开始
**Then** Redux store 设置 `loading` 状态为 true
**And** UI 显示加载指示器
**And** 获取按钮被禁用

#### Scenario: 处理加载完成

**Given** 版本列表获取操作正在进行
**When** 操作成功完成
**Then** Redux store 设置 `loading` 状态为 false
**And** Redux store 更新 `availableVersions` 状态
**And** UI 隐藏加载指示器
**And** 版本列表显示获取的版本

#### Scenario: 处理加载错误

**Given** 版本列表获取操作正在进行
**When** 操作失败
**Then** Redux store 设置 `loading` 状态为 false
**And** Redux store 更新 `error` 状态
**And** UI 隐藏加载指示器
**And** UI 显示错误消息

---

### Requirement: 国际化支持

包源配置界面 MUST 支持中英文界面语言。

#### Scenario: 中文界面显示包源配置

**Given** 用户选择中文语言
**When** 渲染包源配置界面
**Then** 包源类型标签显示："包源类型"
**And** 源类型选项显示："本地文件夹"、"GitHub Releases"
**And** 文件夹配置标签显示："文件夹路径"
**And** GitHub 配置标签显示："仓库所有者"、"仓库名称"、"认证令牌（可选）"
**And** 按钮文本使用中文："扫描可用版本"、"从 GitHub 获取"、"安装包"

#### Scenario: 英文界面显示包源配置

**Given** 用户选择英文语言
**When** 渲染包源配置界面
**Then** 包源类型标签显示："Package Source"
**And** 源类型选项显示："Local Folder"、"GitHub Releases"
**And** 文件夹配置标签显示："Folder Path"
**And** GitHub 配置标签显示："Repository Owner"、"Repository Name"、"Auth Token (Optional)"
**And** 按钮文本使用英文："Scan Available Versions"、"Fetch from GitHub"、"Install Package"

#### Scenario: 错误消息国际化

**Given** 用户使用中文界面
**When** 发生路径验证错误
**Then** 错误消息显示中文："此路径不存在或无法访问"
**Given** 用户使用英文界面
**When** 发生路径验证错误
**Then** 错误消息显示英文："This path does not exist or is not accessible"

---

## MODIFIED Requirements

### Requirement: 多源包安装支持

应用 MUST 支持从多种源（文件夹、GitHub Release）获取和安装 nort 软件包。

#### Scenario: 从文件夹源安装 nort 包

**Given** 用户选择文件夹作为包源类型
**And** 用户配置了有效的本地文件夹路径
**And** 文件夹包含 nort 软件包（如 `hagicode-0.1.0-alpha.8-linux-x64.zip`）
**When** 用户点击"扫描可用版本"按钮
**Then** 应用扫描文件夹中的所有 .zip 文件
**And** 从文件名解析出版本号和平台信息
**And** 在版本下拉框中显示匹配当前平台的版本列表
**And** 用户选择版本后点击"安装包"按钮
**Then** 应用从本地文件夹复制文件到缓存目录
**And** 解压包到安装目录
**And** 验证包的完整性
**And** 更新包元数据

#### Scenario: 从 GitHub Release 源安装 nort 包

**Given** 用户选择 GitHub Release 作为包源类型
**And** 用户配置了有效的 GitHub 仓库（owner/repo）
**When** 用户点击"从 GitHub 获取版本"按钮
**Then** 应用调用 GitHub Releases API 获取 Release 列表
**And** 过滤出包含 nort 软件包的 Release
**And** 从 Release 资产中解析版本号和平台信息
**And** 在版本下拉框中显示匹配当前平台的版本列表
**And** 用户选择版本后点击"安装包"按钮
**Then** 应用从 GitHub Release 下载对应的资产文件
**And** 显示下载进度
**And** 下载完成后解压包到安装目录
**And** 验证包的完整性
**And** 更新包元数据

#### Scenario: GitHub 源使用认证 Token

**Given** 用户选择 GitHub Release 作为包源类型
**And** 目标仓库是私有仓库或需要更高的 API 速率限制
**When** 用户在可选的 Token 字段输入 GitHub Personal Access Token
**And** 用户点击"从 GitHub 获取版本"按钮
**Then** 应用在 API 请求中包含认证头（Authorization: token XXX）
**And** 应用能访问私有仓库的 Release
**And** API 速率限制提升到 5000 次/小时
**And** Token 被安全存储（不记录到日志）

#### Scenario: 处理网络错误和重试

**Given** 用户正在从 GitHub Release 源下载包
**When** 网络连接中断或请求超时
**Then** 应用显示友好的错误消息
**And** 错误消息包含具体的失败原因
**And** 提供"重试"按钮
**And** 在控制台记录详细的错误日志
**And** 清理已下载的部分文件

---

### Requirement: 向后兼容性

应用 MUST 保持与现有文件夹安装方式的完全兼容。

#### Scenario: 默认使用文件夹源

**Given** 用户首次启动应用或未配置包源
**When** 用户打开包管理界面
**Then** 默认选择文件夹源类型
**And** 文件夹路径从配置加载或使用默认路径
**And** 现有功能不受影响

#### Scenario: 保持现有 IPC 接口

**Given** 渲染进程使用现有的 IPC 接口
**When** 调用 `getAvailableVersions()` 或 `installPackage()`
**Then** 接口继续工作
**And** 内部使用新的包源抽象
**And** 不破坏现有代码

#### Scenario: 现有安装包不受影响

**Given** 用户已经通过文件夹源安装了包
**When** 用户升级应用版本
**Then** 已安装的包继续正常工作
**And** 包元数据正确读取
**And** Web 服务可以正常启动
