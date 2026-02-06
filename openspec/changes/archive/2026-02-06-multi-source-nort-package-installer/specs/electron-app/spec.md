# electron-app Specification Delta

## ADDED Requirements

### Requirement: 包源配置界面

应用 MUST 在包管理界面提供统一的包源配置区域，支持用户选择和配置不同的包源类型。

#### Scenario: 显示包源配置区域

**Given** 用户在主窗口的包管理界面
**When** 界面加载完成
**Then** 在版本选择器上方显示包源配置区域
**And** 包含包源类型下拉选择器
**And** 包含当前源类型的配置表单
**And** 包含操作按钮（扫描/获取版本）
**And** 包含 nort 包提示横幅

#### Scenario: 切换包源类型

**Given** 用户在包源配置区域
**When** 用户点击包源类型下拉选择器
**Then** 显示三个选项："文件夹"、"GitHub Release"、"HTTP"
**And** 用户选择一个选项后
**Then** 配置表单动态切换为对应类型的表单
**And** 保持之前的配置（切换回来时恢复）

#### Scenario: 文件夹源配置表单

**Given** 用户选择了"文件夹"作为包源类型
**When** 渲染配置表单
**Then** 显示路径输入框
**And** 显示"浏览"按钮
**And** 显示"扫描可用版本"按钮
**And** 所有表单字段有对应的标签

#### Scenario: GitHub Release 源配置表单

**Given** 用户选择了"GitHub Release"作为包源类型
**When** 渲染配置表单
**Then** 显示"所有者"（Owner）输入框
**And** 显示"仓库"（Repository）输入框
**And** 显示"访问令牌"（Token）输入框（可选，标记为"可选"）
**And** 显示令牌帮助提示（说明如何获取 Token）
**And** 显示"从 GitHub 获取版本"按钮
**And** 所有表单字段有对应的标签

#### Scenario: HTTP 源配置表单

**Given** 用户选择了"HTTP"作为包源类型
**When** 渲染配置表单
**Then** 显示 URL 输入框
**And** 显示 URL 格式提示（如：https://example.com/hagicode-0.1.0-linux-x64.zip）
**And** 显示 URL 验证状态（实时验证格式）
**And** 如果 URL 有效，显示解析的版本信息
**And** 不显示"获取版本"按钮（版本从 URL 解析）

#### Scenario: 配置表单验证

**Given** 用户在包源配置表单中输入信息
**When** 用户点击操作按钮（扫描/获取版本）
**Then** 应用验证所有必填字段
**And** 如果验证失败，在对应字段下方显示错误提示
**And** 禁用操作按钮直到验证通过
**And** 错误提示使用红色文本

---

### Requirement: 包源状态管理

应用 MUST 在 Redux store 中管理包源配置和状态。

#### Scenario: 存储包源配置

**Given** 用户配置了包源并成功获取了版本列表
**When** 配置完成
**Then** 包源配置存储在 Redux store 的 `packageSource` slice 中
**And** 配置包括：sourceType、config（路径/仓库/URL）、lastFetched、availableVersions
**And** 配置持久化到 electron-store

#### Scenario: 加载已保存的包源配置

**Given** 用户之前配置了包源
**When** 应用启动或用户刷新包管理界面
**Then** 应用从 electron-store 加载包源配置
**And** 恢复包源类型选择器
**And** 恢复配置表单字段值
**And** 显示上次获取的版本列表（如果可用）

#### Scenario: 清除包源状态

**Given** 用户切换包源类型
**When** 新类型选中
**Then** 清除之前的版本列表
**And** 清除加载状态
**And** 清除错误状态
**And** 但保留表单值（用于编辑）

#### Scenario: 包源操作加载状态

**Given** 用户点击"扫描可用版本"或"从 GitHub 获取版本"按钮
**When** 操作进行中
**Then** Redux store 中的 `packageSource.isLoading` 为 true
**And** 操作按钮显示加载状态（旋转图标）
**And** 操作按钮被禁用
**And** 版本选择器被禁用
**And** "安装包"按钮被禁用

#### Scenario: 包源操作错误状态

**Given** 用户执行包源操作时发生错误
**When** 错误发生
**Then** Redux store 中的 `packageSource.error` 包含错误信息
**And** 在配置区域下方显示错误提示框
**And** 错误提示框包含具体错误消息
**And** 显示"重试"按钮
**And** 加载状态重置为 false

---

### Requirement: nort 包提示展示

应用 MUST 在包管理界面显眼位置显示"仅支持 nort 包"的提示信息。

#### Scenario: 提示横幅位置和样式

**Given** 用户在包管理界面
**When** 界面渲染
**Then** 在包源配置区域下方显示提示横幅
**And** 横幅宽度与配置区域相同
**And** 横幅使用警告样式（黄色背景）
**And** 横幅左侧显示信息图标
**And** 横幅右侧显示关闭按钮（可选）

#### Scenario: 提示文本内容

**Given** 提示横幅显示
**When** 查看横幅内容
**Then** 中文界面显示："⚠️ 注意：仅支持 nort 软件包"
**And** 英文界面显示："⚠️ Notice: Only nort packages are supported"
**And** 文本使用适合警告的样式（粗体、深色）

#### Scenario: 提示横幅可关闭

**Given** 提示横幅显示
**When** 用户点击关闭按钮
**Then** 横幅隐藏
**And** 记录关闭状态到 electron-store
**And** 下次启动应用时保持隐藏状态
**And** 提供"恢复提示"选项（在设置中）

---

### Requirement: 包源操作反馈

应用 MUST 在用户执行包源操作时提供及时的反馈。

#### Scenario: 获取版本成功反馈

**Given** 用户点击"扫描可用版本"或"从 GitHub 获取版本"按钮
**When** 版本列表成功获取
**Then** 显示成功提示（Toast）
**And** 提示内容："找到 X 个可用版本"
**And** 版本下拉框更新为获取的版本列表
**And** 版本选择器启用
**And** "安装包"按钮启用（如果版本不为空）

#### Scenario: 获取版本失败反馈

**Given** 用户点击获取版本按钮
**When** 操作失败（如网络错误、API 错误）
**Then** 显示错误提示（Toast 或对话框）
**And** 错误消息包含具体失败原因
**And** 在配置区域下方显示错误详情
**And** 提供"重试"按钮
**And** 版本选择器保持禁用状态

#### Scenario: 下载进度显示

**Given** 用户从 GitHub 或 HTTP 源安装包
**When** 下载进行中
**Then** 在进度区域显示下载进度
**And** 进度条显示下载百分比
**And** 文本显示下载速度和剩余时间
**And** 进度区域使用明显的视觉样式（如蓝色进度条）
**And** 下载完成后自动进入解压阶段

---

## MODIFIED Requirements

### Requirement: 包管理界面

应用 MUST 提供统一的包管理界面，支持包的安装、更新和版本管理，并支持多源配置。

#### Scenario: 显示包管理界面

**Given** 用户在主窗口的"版本管理"页面
**When** 页面加载完成
**Then** 显示包管理卡片
**And** 卡片包含以下部分（按顺序）：
  1. 包源配置区域
  2. nort 包提示横幅
  3. 版本选择区域（显示可用版本数量）
  4. 安装按钮
  5. 安装进度区域
  6. 已安装包信息

#### Scenario: 安装包流程

**Given** 用户配置了包源并选择了版本
**When** 用户点击"安装包"按钮
**Then** 应用验证包源配置和版本选择
**And** 显示安装进度（包括下载、解压、验证阶段）
**And** 安装完成后更新已安装包信息
**And** 自动检查依赖项
**And** 显示成功通知

#### Scenario: 显示可用版本

**Given** 用户已配置包源并获取了版本列表
**When** 渲染版本选择区域
**Then** 显示"可用版本：X 个版本"文本
**And** 显示版本下拉选择器
**And** 下拉选项显示完整文件名（如 hagicode-0.1.0-alpha.8-linux-x64.zip）
**And** 下拉选项按版本号降序排列（最新版本在前）
**And** 如果版本列表为空，显示"未找到可用版本"消息

#### Scenario: 显示已安装包信息

**Given** 用户已安装了包
**When** 渲染已安装包信息区域
**Then** 显示当前安装的版本号
**And** 显示安装路径
**And** 显示安装时间
**And** 显示"卸载"按钮
**And** 如果安装了更新的版本，显示"有更新可用"提示
