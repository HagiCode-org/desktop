# package-management Specification Delta

## ADDED Requirements

### Requirement: 安装时自动配置数据目录

应用 MUST 在安装 Web 服务包时自动配置数据目录，使用固定的路径 `<userData>/apps/data`。

#### Scenario: 安装时自动配置数据目录

**Given** 用户启动 Web 服务包安装流程
**And** 包下载和解压已完成
**And** 安装验证已成功
**When** 安装流程进入配置阶段
**Then** 应用使用 `app.getPath('userData')` 获取用户数据目录
**And** 应用构建数据目录路径为 `<userData>/apps/data`
**And** 应用检查目录是否存在
**And** 如果目录不存在，应用自动创建目录
**And** 应用设置适当的目录权限
**And** 应用读取 `appsettings.yml` 文件
**And** 应用更新或添加 `DataDir` 配置项为绝对路径
**And** 应用保存更新后的配置文件

#### Scenario: 安装进度显示数据目录配置状态

**Given** 应用正在安装 Web 服务包
**And** 安装进入数据目录配置阶段
**When** 配置正在进行
**Then** 应用在安装进度中显示"正在配置数据目录..."消息
**And** 应用显示数据目录位置信息
**And** 配置完成后显示"数据目录已配置：路径"消息

#### Scenario: 处理目录创建失败

**Given** 应用正在安装 Web 服务包
**And** 应用尝试在 `userData` 下创建 `apps/data` 目录
**And** `userData` 目录不存在或没有创建权限
**When** 应用尝试创建目录
**Then** 应用记录错误日志
**And** 应用在安装进度中显示警告消息
**And** 应用继续安装流程（不中断安装）
**And** 应用提示用户可以手动配置数据目录

#### Scenario: 处理配置文件写入失败

**Given** 应用正在安装 Web 服务包
**And** 数据目录已创建成功
**And** 应用尝试写入 `appsettings.yml`
**And** 文件不存在或没有写入权限
**When** 应用尝试写入配置
**Then** 应用记录错误日志
**And** 应用在安装进度中显示警告消息
**And** 应用继续安装流程（不中断安装）
**And** 应用提示用户可以手动编辑配置文件添加 `DataDir: <绝对路径>`

#### Scenario: 跨平台路径处理

**Given** 应用运行在不同操作系统上
**When** 应用创建数据目录路径
**Then** 应用使用 `app.getPath('userData')` 获取平台特定的用户数据目录
**And** 应用使用 `path.join()` 构建完整路径
**And** Windows 平台路径格式为 `%APPDATA%/hagicode-desktop/apps/data`
**And** macOS 平台路径格式为 `~/Library/Application Support/hagicode-desktop/apps/data`
**And** Linux 平台路径格式为 `~/.config/hagicode-desktop/apps/data`

#### Scenario: 使用绝对路径写入配置

**Given** 应用正在写入 `appsettings.yml`
**When** 应用写入 `DataDir` 配置项
**Then** 应用写入绝对路径（完整的 `<userData>/apps/data` 路径）
**And** 应用不写入相对路径
**And** 配置文件格式正确

#### Scenario: 向后兼容处理

**Given** 用户已安装了旧版本的 Web 服务包
**And** `appsettings.yml` 中不存在 `DataDir` 配置项
**When** 应用启动或包管理器初始化
**Then** 应用检测 `appsettings.yml` 中的配置
**And** 如果缺少 `DataDir`，应用自动写入默认值（`<userData>/apps/data` 的绝对路径）
**And** 应用记录修复日志
**And** 应用不会因缺少 `DataDir` 配置而失败

#### Scenario: 国际化支持 - 中文界面

**Given** 用户选择中文语言
**When** 应用显示安装进度
**Then** 配置阶段显示"正在配置数据目录..."
**And** 配置完成显示"数据目录已配置：{{path}}"
**And** 错误消息使用中文
**And** 警告消息使用中文

#### Scenario: 国际化支持 - 英文界面

**Given** 用户选择英文语言
**When** 应用显示安装进度
**Then** 配置阶段显示"Configuring data directory..."
**And** 配置完成显示"Data directory configured: {{path}}"
**And** 错误消息使用英文
**And** 警告消息使用英文

#### Scenario: 数据目录已存在

**Given** 应用正在安装 Web 服务包
**And** `userData/apps/data` 目录已存在
**When** 应用检查目录
**Then** 应用跳过目录创建
**And** 应用继续配置流程
**And** 应用不显示目录创建消息

#### Scenario: 数据目录权限验证

**Given** 应用正在安装 Web 服务包
**And** 数据目录已存在或已创建
**When** 应用验证目录权限
**Then** 应用检查目录是否可写
**And** 如果不可写，应用记录错误
**And** 应用继续安装流程并显示警告
