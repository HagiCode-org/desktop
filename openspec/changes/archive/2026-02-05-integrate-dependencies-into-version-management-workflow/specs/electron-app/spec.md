## ADDED Requirements

### Requirement: 版本管理

应用 MUST 提供完整的版本管理功能，包括版本列表查询、版本安装、版本卸载和版本切换。

#### Scenario: 查询可用版本列表

**Given** 应用已配置版本来源
**When** 用户打开版本管理页面
**Then** 应用扫描所有配置的版本提供者
**And** 在 5 秒内返回版本列表
**And** 显示每个版本的版本号、发布时间、包大小
**And** 区分可用版本和已安装版本

#### Scenario: 安装新版本

**Given** 用户在版本管理页面
**And** 存在未安装的版本
**When** 用户点击"安装版本"按钮
**Then** 显示下载进度
**And** 下载完成后自动解压到安装目录
**And** 执行安装后脚本（如存在）
**And** 自动检查依赖项
**And** 显示安装完成通知

#### Scenario: 卸载已安装版本

**Given** 用户在版本管理页面
**And** 存在已安装的版本
**When** 用户点击"卸载"按钮
**Then** 显示确认对话框
**And** 用户确认后删除安装目录
**And** 从 electron-store 移除版本记录
**And** 如果卸载的是当前激活版本，重置激活状态

#### Scenario: 切换激活版本

**Given** 存在多个已安装版本
**When** 用户选择某个版本并点击"激活"
**Then** 更新 electron-store 中的当前激活版本
**And** 在仪表盘显示新激活的版本
**And** 如果新激活版本依赖项未满足，显示警告

#### Scenario: 版本安装失败处理

**Given** 用户正在安装版本
**When** 下载失败或解压失败
**Then** 显示错误消息对话框
**And** 错误消息包含具体失败原因
**And** 提供重试按钮
**And** 清理部分下载的文件

---

### Requirement: Manifest 文件解析

应用 MUST 能够解析版本的 manifest.yaml 文件，提取版本元数据和依赖项信息。

#### Scenario: 读取并解析 manifest.yaml

**Given** 版本已安装到文件系统
**When** 应用读取 manifest.yaml
**Then** 使用 js-yaml 库解析 YAML 格式
**And** 提取版本信息（name、version、description）
**And** 提取依赖项列表（dependencies）
**And** 验证必需字段是否存在

#### Scenario: 处理无效的 manifest.yaml

**Given** 版本目录中存在 manifest.yaml
**When** 文件格式无效或缺少必需字段
**Then** 记录错误日志
**And** 标记版本为"manifest 无效"
**And** 在 UI 中显示警告但不阻止其他操作

#### Scenario: manifest.yaml 缺失

**Given** 版本已安装
**When** 应用查找 manifest.yaml
**Then** 如果文件不存在
**And** 标记版本为"无 manifest 信息"
**And** 使用默认版本信息（从目录名推断）

---

### Requirement: 版本提供者扫描

应用 MUST 支持从多个来源扫描可用版本，包括本地文件系统、远程仓库和 Git 仓库。

#### Scenario: 扫描本地文件系统版本

**Given** 应用配置了本地版本目录
**When** 执行版本扫描
**Then** 遍历指定目录
**And** 查找包含 manifest.yaml 的子目录
**And** 读取每个版本的 manifest.yaml
**And** 返回本地可用版本列表

#### Scenario: 扫描远程仓库版本

**Given** 应用配置了远程版本仓库 URL
**When** 执行版本扫描
**Then** 通过 HTTP 请求获取版本列表
**And** 解析响应中的版本元数据
**And** 返回远程可用版本列表
**And** 缓存结果以减少网络请求

#### Scenario: 扫描 Git 仓库版本

**Given** 应用配置了 Git 仓库 URL
**When** 执行版本扫描
**Then** 执行 `git ls-remote` 获取版本标签
**And** 解析标签名称提取版本号
**And** 使用 semver 规范化版本号
**And** 返回 Git 仓库可用版本列表

#### Scenario: 版本去重和排序

**Given** 多个版本提供者返回版本
**When** 合并版本列表
**Then** 使用版本号作为唯一标识去重
**And** 使用 semver 按照从新到旧排序
**And** 保留每个版本的来源信息

---

### Requirement: 版本状态管理

应用 MUST 维护每个已安装版本的状态，包括安装状态、依赖项状态和激活状态。

#### Scenario: 版本状态分类

**Given** 版本已安装
**When** 应用检查版本状态
**Then** 根据依赖项检查结果分类：
  - `installed-ready`: 所有依赖项满足
  - `installed-incomplete`: 存在缺失或冲突的依赖项
**And** 存储状态到 electron-store

#### Scenario: 查询当前激活版本

**Given** 应用启动
**When** 加载版本配置
**Then** 从 electron-store 读取 `currentVersion` 字段
**And** 验证该版本是否仍存在
**And** 在仪表盘显示激活版本信息

#### Scenario: 更新激活版本

**Given** 用户切换激活版本
**When** 新版本激活成功
**Then** 更新 electron-store 中的 `currentVersion`
**And** 发送 IPC 事件通知渲染进程
**And** 更新仪表盘显示

---

### Requirement: 导航结构优化

应用 MUST 提供简洁的导航结构，将相关功能整合到合适的页面中。

#### Scenario: 侧边栏导航结构

**Given** 应用启动
**When** 渲染侧边栏导航
**Then** 显示以下导航项：
  - 仪表盘
  - Web 服务
  - 版本管理
**And** 不显示独立的"依赖项管理"导航项

#### Scenario: 从仪表盘访问版本管理

**Given** 用户在仪表盘
**And** 显示版本状态提示（如"缺少依赖项"）
**When** 用户点击版本状态区域
**Then** 导航到版本管理页面
**And** 自动选中对应版本并展开依赖项详情

#### Scenario: 从版本管理返回仪表盘

**Given** 用户在版本管理页面
**When** 用户点击"返回仪表盘"按钮
**Then** 导航回仪表盘
**And** 刷新版本状态显示

---

### Requirement: 启用条件校验

应用 MUST 在用户尝试启用 Web 服务前检查当前激活版本的依赖项状态。

#### Scenario: 依赖项满足时允许启用

**Given** 当前激活版本状态为 `installed-ready`
**When** 用户在仪表盘点击"启动服务"
**Then** 允许启动流程继续
**And** 显示服务启动中状态

#### Scenario: 依赖项未满足时阻止启用

**Given** 当前激活版本状态为 `installed-incomplete`
**When** 用户在仪表盘查看服务状态
**Then** "启动服务"按钮禁用或隐藏
**And** 显示"需要先安装依赖项"提示
**And** 提供"查看依赖项"按钮链接到版本管理页面

#### Scenario: 依赖项安装完成后更新状态

**Given** 当前激活版本状态为 `installed-incomplete`
**When** 用户在版本管理页面安装了所有缺失的依赖项
**Then** 自动更新版本状态为 `installed-ready`
**And** 启用仪表盘中的"启动服务"按钮
**And** 显示状态更新通知

---

### Requirement: 跨平台版本兼容性

应用 MUST 在不同平台上正确处理版本路径、命令执行和权限管理。

#### Scenario: Windows 平台版本安装

**Given** 应用运行在 Windows
**When** 用户安装版本
**Then** 使用 Windows 路径格式（如 `C:\Users\...\.hagico\versions\v1.2.3`）
**And** 执行 Windows 平台特定的安装后脚本（如 `install.bat`）

#### Scenario: macOS 平台版本安装

**Given** 应用运行在 macOS
**When** 用户安装版本
**Then** 使用 macOS 路径格式（如 `/Users/.../.hagico/versions/v1.2.3`）
**And** 执行 macOS 平台特定的安装后脚本（如 `install.sh`）

#### Scenario: Linux 平台版本安装

**Given** 应用运行在 Linux
**When** 用户安装版本
**Then** 使用 Linux 路径格式（如 `/home/.../.hagico/versions/v1.2.3`）
**And** 执行 Linux 平台特定的安装后脚本（如 `install.sh`）
**And** 处理文件权限（设置可执行权限）

---

### Requirement: 版本下载和校验

应用 MUST 安全地下载版本包，并验证文件完整性。

#### Scenario: 下载版本包

**Given** 用户选择安装远程版本
**When** 开始下载
**Then** 显示下载进度（百分比和速度）
**And** 支持断点续传（如果服务器支持）
**And** 下载到临时目录

#### Scenario: 校验下载文件完整性

**Given** 版本包下载完成
**When** manifest.yaml 中提供了 checksum
**Then** 计算下载文件的 SHA256 哈希值
**And** 与 manifest.yaml 中的 checksum 比较
**And** 如果不匹配，删除文件并提示下载失败

#### Scenario: 下载失败重试

**Given** 版本包下载失败
**When** 检测到网络错误或服务器错误
**Then** 显示错误提示
**And** 提供"重试"按钮
**And** 最多自动重试 3 次

---

### Requirement: 用户引导和通知

应用 MUST 在首次使用新功能时提供适当的引导和帮助信息。

#### Scenario: 首次打开版本管理页面

**Given** 用户首次打开版本管理页面
**And** 之前未使用过版本管理功能
**When** 页面加载完成
**Then** 在页面顶部显示可关闭的引导提示
**And** 说明版本管理功能的作用和操作方法
**And** 记录用户已查看引导，下次不再显示

#### Scenario: 菜单重组通知

**Given** 用户升级到新版本
**And** 之前使用过独立的"依赖项管理"功能
**When** 用户首次启动应用
**Then** 显示通知："依赖项管理已整合到版本管理中"
**And** 提供按钮跳转到版本管理页面
**And** 记录用户已查看通知

#### Scenario: 操作成功通知

**Given** 用户完成版本安装
**When** 安装流程成功结束
**Then** 显示 Toast 通知："版本 v1.2.3 安装成功"
**And** 如果存在依赖项，提示用户查看依赖项状态

#### Scenario: 操作失败通知

**Given** 用户操作失败（安装、卸载等）
**When** 检测到错误
**Then** 显示 Toast 通知："操作失败：[错误原因]"
**And** 提供查看详情或重试的选项

---

## MODIFIED Requirements

### Requirement: System Tray Integration

The application MUST provide a persistent icon in the OS notification area (Windows) / menu bar (macOS) / system tray (Linux) to allow users quick access to application features.

#### Scenario: Windows 系统托盘显示和交互

**Given** 应用正在运行
**When** 查看任务栏右下角通知区域
**Then** 显示 Hagicode Desktop 托盘图标
**And** 右键点击图标显示上下文菜单
**And** 菜单包含 "显示窗口"、"版本管理" 和 "退出" 选项
**And** 托盘图标根据服务器状态变化（运行中/已停止）

#### Scenario: macOS 菜单栏显示和交互

**Given** 应用正在运行
**When** 查看屏幕顶部菜单栏
**Then** 显示 Hagicode Desktop 菜单栏图标
**And** 点击图标显示下拉菜单
**And** 菜单包含 "显示窗口"、"版本管理" 和 "退出" 选项

#### Scenario: Linux 系统托盘显示和交互

**Given** 应用正在运行
**When** 查看系统托盘区域
**Then** 显示 Hagicode Desktop 托盘图标（如果桌面环境支持）
**And** 右键点击图标显示上下文菜单
**And** 菜单包含 "显示窗口"、"版本管理" 和 "退出" 选项

#### Scenario: 通过托盘显示主窗口

**Given** 主窗口已隐藏或最小化
**When** 用户右键点击托盘图标并选择 "显示窗口"
**Then** 主窗口恢复显示并置于前台
**And** 窗口保持之前的尺寸和位置

#### Scenario: 通过托盘打开版本管理

**Given** 应用正在运行
**When** 用户右键点击托盘图标并选择 "版本管理"
**Then** 主窗口显示并导航到版本管理页面
**And** 显示版本列表和状态

#### Scenario: 通过托盘退出应用

**Given** 应用正在运行
**When** 用户右键点击托盘图标并选择 "退出"
**Then** 应用完全退出
**And** 托盘图标消失
**And** 系统资源被释放

#### Scenario: 托盘图标反映服务器状态

**Given** 应用正在运行并已连接到服务器
**When** 服务器状态发生变化（如从运行中变为已停止）
**Then** 系统托盘图标在 3 秒内更新
**And** 鼠标悬停在托盘图标上显示当前状态
**And** 图标样式或颜色根据状态变化

#### Scenario: 托盘图标反映版本状态

**Given** 应用正在运行
**And** 当前激活版本缺少依赖项
**When** 鼠标悬停在托盘图标上
**Then** 显示当前激活版本号
**And** 如果依赖项未满足，显示"⚠ 依赖项未满足"提示

---

### Requirement: Server Control

The application MUST allow users to control Hagicode Server start, stop, and restart operations through the main window.

#### Scenario: 启动 Hagicode Server（依赖项满足）

**Given** Hagicode Server 已安装
**And** 当前激活版本所有依赖项已满足
**And** 服务当前未运行
**When** 用户在仪表盘点击 "启动服务" 按钮
**Then** 应用向服务器发送启动请求
**And** 显示加载状态指示器
**And** 服务器在 5 秒内开始启动
**And** 应用显示 "服务器正在启动" 通知
**And** 状态更新为 "启动中" 然后变为 "运行中"

#### Scenario: 启动 Hagicode Server（依赖项未满足）

**Given** Hagicode Server 已安装
**And** 当前激活版本存在未满足的依赖项
**When** 用户在仪表盘查看服务状态
**Then** "启动服务" 按钮禁用或隐藏
**And** 显示 "需要先安装依赖项" 提示
**And** 显示 "查看依赖项" 按钮
**And** 点击按钮导航到版本管理页面

#### Scenario: 停止 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在仪表盘点击 "停止服务" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后向服务器发送停止请求
**And** 应用显示 "服务器正在停止" 通知
**And** 状态更新为 "已停止"

#### Scenario: 重启 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在仪表盘点击 "重启服务" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后先停止再启动服务器
**And** 应用显示进度通知
**And** 服务器成功重启后状态更新为 "运行中"

#### Scenario: 服务器控制失败处理

**Given** 用户尝试控制服务器（启动/停止/重启）
**When** 服务器返回错误或无响应
**Then** 应用显示错误消息对话框
**And** 错误消息包含具体失败原因
**And** 应用记录错误日志
**And** 状态显示为 "错误"
