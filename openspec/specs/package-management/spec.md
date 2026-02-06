# package-management Specification

## Purpose
定义 Hagicode Desktop 的软件包管理功能，包括从多种源（文件夹、GitHub Release、HTTP）安装 nort 软件包的能力。

## Requirements

### Requirement: 多源包安装支持

应用 MUST 支持从多种源（文件夹、GitHub Release、HTTP URL）获取和安装 nort 软件包。

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

#### Scenario: 从 HTTP 源安装 nort 包

**Given** 用户选择 HTTP 作为包源类型
**And** 用户配置了有效的 HTTP(S) URL（指向 .zip 文件）
**When** 用户完成 URL 输入
**Then** 应用验证 URL 格式是否正确
**And** 从 URL 中解析出版本号和平台信息
**And** 在版本选择区域显示解析的版本信息
**And** 用户点击"安装包"按钮
**Then** 应用通过 HTTP GET 请求下载文件
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

**Given** 用户正在从 GitHub Release 或 HTTP 源下载包
**When** 网络连接中断或请求超时
**Then** 应用显示友好的错误消息
**And** 错误消息包含具体的失败原因
**And** 提供"重试"按钮
**And** 在控制台记录详细的错误日志
**And** 清理已下载的部分文件

---

### Requirement: nort 包类型约束

应用 MUST 仅接受和安装 nort 类型的软件包，拒绝其他类型的包。

#### Scenario: 验证 nort 包文件名格式

**Given** 用户从任何源选择了一个软件包文件
**When** 应用开始验证包
**Then** 应用检查文件名是否符合 nort 包命名规范
**And** 文件名格式为：`hagicode-{version}-{platform}.zip`
**And** 版本号遵循 semver 规范
**And** 平台标识符为：linux-x64、osx-x64、win-x64

#### Scenario: 拒绝非 nort 包

**Given** 用户尝试安装一个文件名不符合规范的包
**When** 应用检测到文件名不匹配 nort 包格式
**Then** 应用拒绝安装
**And** 显示错误消息："仅支持 nort 软件包"
**And** 错误消息包含期望的文件名格式示例
**And** 不执行任何安装操作

#### Scenario: 显示 nort 包提示信息

**Given** 用户在包管理界面
**When** 界面加载完成
**Then** 在包源配置区域显示提示横幅
**And** 提示内容："注意：仅支持 nort 软件包"
**And** 提示横幅使用警告样式（黄色背景）

#### Scenario: GitHub 源过滤非 nort 包

**Given** 用户从 GitHub Release 源获取版本列表
**When** GitHub Release 包含多种类型的资产
**Then** 应用仅显示文件名匹配 nort 包格式的资产
**And** 忽略其他文件（如 .txt、.json、no-runtime 包等）
**And** 版本列表仅包含有效的 nort 包

---

### Requirement: 包源抽象接口

应用架构 MUST 通过统一的 `PackageSource` 接口支持多种包源类型，便于扩展新的包源。

#### Scenario: 包源接口一致性

**Given** 开发者需要实现新的包源类型（如 npm registry）
**When** 实现 `PackageSource` 接口
**Then** 必须实现 `listAvailableVersions()` 方法
**And** 必须实现 `downloadPackage()` 方法
**And** 必须实现 `fetchPackage()` 方法
**And** 所有方法返回统一的 Promise 类型
**And** 错误处理遵循统一的模式

#### Scenario: 包源工厂创建

**Given** 用户在 UI 中选择一种包源类型并配置
**When** UI 调用 `createPackageSource(config)`
**Then** 应用根据配置创建对应的包源实例
**And** 返回实现了 `PackageSource` 接口的对象
**And** 包管理器通过接口调用方法，不关心具体实现

#### Scenario: 包源配置持久化

**Given** 用户配置了包源并成功安装了包
**When** 用户重启应用
**Then** 应用从 electron-store 加载上次的包源配置
**And** 自动填充包源配置表单
**And** 用户可以修改配置或使用上次的配置

---

### Requirement: 平台感知的版本过滤

应用 MUST 根据当前操作系统平台过滤可用版本，仅显示兼容的包。

#### Scenario: Linux 平台过滤版本

**Given** 应用运行在 Linux 系统上
**When** 从任何源获取版本列表
**Then** 版本下拉框仅显示包含 "linux" 标识的版本
**And** 排除 win-x64、osx-x64 等其他平台的版本
**And** 显示版本数量："找到 X 个版本（已按平台过滤：linux）"

#### Scenario: Windows 平台过滤版本

**Given** 应用运行在 Windows 系统上
**When** 从任何源获取版本列表
**Then** 版本下拉框仅显示包含 "win" 标识的版本
**And** 排除其他平台的版本

#### Scenario: macOS 平台过滤版本

**Given** 应用运行在 macOS 系统上
**When** 从任何源获取版本列表
**Then** 版本下拉框仅显示包含 "darwin" 或 "osx" 标识的版本
**And** 排除其他平台的版本

#### Scenario: 无兼容版本时的处理

**Given** 应用运行在特定平台
**When** 版本列表中没有匹配当前平台的版本
**Then** 版本下拉框显示"未找到兼容版本"消息
**And** 禁用"安装包"按钮
**And** 提示用户联系包维护者

---

### Requirement: 包安装进度反馈

应用 MUST 在包下载和安装过程中提供实时的进度反馈。

#### Scenario: 显示下载进度

**Given** 用户正在从 GitHub Release 或 HTTP 源下载包
**When** 下载进行中
**Then** 显示下载进度条（0-100%）
**And** 显示当前下载速度
**And** 显示已下载/总大小（如 15.2 MB / 45.8 MB）
**And** 显示预计剩余时间

#### Scenario: 显示安装阶段

**Given** 用户正在安装包
**When** 安装流程进行中
**Then** 显示当前安装阶段：下载中 → 解压中 → 验证中 → 完成
**And** 每个阶段显示对应的进度百分比
**And** 各阶段之间有平滑的过渡动画

#### Scenario: 安装完成通知

**Given** 包安装流程完成
**When** 所有阶段成功执行
**Then** 显示成功通知
**And** 通知内容："软件包 X.X.X 安装成功"
**And** 自动刷新依赖项状态
**And** 更新 Web 服务状态卡片
**And** 如果之前显示了安装提示，则移除提示

#### Scenario: 安装失败处理

**Given** 包安装流程中发生错误
**When** 任何阶段失败
**Then** 显示错误通知
**And** 错误消息包含具体的失败原因和阶段
**And** 提供"查看日志"按钮（如可能）
**And** 清理部分下载的文件
**And** 恢复安装前的状态

---

### Requirement: GitHub API 集成

应用 MUST 正确集成 GitHub Releases API 并处理 API 限制。

#### Scenario: 调用 GitHub Releases API

**Given** 用户配置了 GitHub Release 源
**When** 用户点击"从 GitHub 获取版本"按钮
**Then** 应用向 `https://api.github.com/repos/{owner}/{repo}/releases` 发送 GET 请求
**And** 设置 User-Agent 头为应用名称
**And** 如果提供了 Token，设置 Authorization 头
**And** 解析返回的 JSON 响应

#### Scenario: 处理 GitHub API 速率限制

**Given** 用户频繁调用 GitHub API
**When** API 返回 403 状态码和速率限制头
**Then** 应用解析 `X-RateLimit-Remaining` 和 `X-RateLimit-Reset` 头
**And** 显示友好的速率限制消息
**And** 消息包含重置时间（如"请在 15 分钟后重试"）
**And** 提示用户使用认证 Token 以提高限制

#### Scenario: 处理私有仓库认证失败

**Given** 用户尝试访问私有仓库
**When** 认证 Token 无效或未提供
**Then** API 返回 404 或 401 状态码
**And** 应用显示错误消息："无法访问仓库，请检查 Token 是否有效"
**And** 提示用户提供有效的 Personal Access Token

#### Scenario: 解析 Release 资产

**Given** GitHub API 返回 Release 列表
**When** 应用解析每个 Release
**Then** 遍历 `release.assets` 数组
**And** 过滤文件名匹配 nort 包格式的资产
**And** 提取版本号（从 `tag_name` 或文件名）
**And** 提取下载 URL（`browser_download_url`）
**And** 提取文件大小（`size`）

---

### Requirement: 包源配置验证

应用 MUST 在执行操作前验证包源配置的有效性。

#### Scenario: 验证文件夹路径

**Given** 用户选择文件夹源并输入路径
**When** 用户点击"扫描可用版本"按钮
**Then** 应用验证路径是否存在
**And** 验证路径是否为目录
**And** 验证应用是否有读取权限
**And** 如果验证失败，显示错误消息
**And** 错误消息包含具体的失败原因

#### Scenario: 验证 GitHub 仓库格式

**Given** 用户选择 GitHub Release 源
**When** 用户输入 owner 和 repo
**Then** 应用验证 owner 和 repo 不为空
**And** 验证格式符合 GitHub 命名规范（仅字母、数字、连字符）
**And** 如果提供了 Token，验证 Token 格式（以 `github_pat_` 开头或 40 字符十六进制）
**And** 如果验证失败，显示字段级错误提示

#### Scenario: 验证 HTTP URL

**Given** 用户选择 HTTP 源
**When** 用户输入 URL
**Then** 应用验证 URL 格式是否有效
**And** 验证 URL 协议为 http 或 https
**And** 验证 URL 指向 .zip 文件（路径以 .zip 结尾）
**And** 如果验证失败，显示字段级错误提示

---

### Requirement: 向后兼容性

应用 MUST 保持与现有文件夹安装方式的完全兼容。

#### Scenario: 默认使用文件夹源

**Given** 用户首次启动应用或未配置包源
**When** 用户打开包管理界面
**Then** 默认选择文件夹源类型
**And** 文件夹路径预填充为默认路径（如开发路径）
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

---

### Requirement: 国际化支持

包管理界面 MUST 支持中文和英文界面语言。

#### Scenario: 中文界面显示包源配置

**Given** 用户选择中文语言
**When** 渲染包源配置界面
**Then** 包源类型标签显示："包源类型"
**And** 源类型选项显示："文件夹"、"GitHub Release"、"HTTP 源"
**And** 配置字段标签使用中文
**And** 按钮文本使用中文："扫描可用版本"、"从 GitHub 获取版本"、"安装包"

#### Scenario: 英文界面显示包源配置

**Given** 用户选择英文语言
**When** 渲染包源配置界面
**Then** 包源类型标签显示："Package Source"
**And** 源类型选项显示："Folder"、"GitHub Release"、"HTTP"
**And** 配置字段标签使用英文
**And** 按钮文本使用英文："Scan Available Versions"、"Fetch from GitHub"、"Install Package"

#### Scenario: nort 包提示的国际化

**Given** 用户在包管理界面
**When** 显示 nort 包提示横幅
**Then** 中文界面显示："注意：仅支持 nort 软件包"
**And** 英文界面显示："Notice: Only nort packages are supported"
