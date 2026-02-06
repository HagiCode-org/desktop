## REMOVED Requirements

### Requirement: Remote Server Control

**Reason**: Remote 服务器功能在本版本中暂不实现，简化首页架构并聚焦于核心嵌入式 Web 服务管理功能。

**Migration**: 无迁移路径，该功能未正式实现和发布，直接移除相关 UI、IPC 通道和状态管理代码。

---

## REMOVED Requirements

### Requirement: 远程服务器连接和状态查询

应用 MUST 能够连接到远程 Hagicode Server，查询其运行状态，并在主窗口中显示。

**Reason**: Remote 服务器功能在本版本中暂不实现。

**Migration**: 移除相关的 IPC 通道（`connectRemoteServer`、`disconnectRemoteServer`、`onRemoteServerStatusChange`）和 Redux 状态。

---

## MODIFIED Requirements

### Requirement: 首页仪表盘

应用 MUST 提供一个简洁的首页仪表盘（Dashboard），显示嵌入式 Web 服务的基本状态和核心控制功能，不包括复杂的管理功能。

#### Scenario: 首页显示核心 Web 服务状态

**Given** 用户启动应用并导航到首页
**When** 首页加载完成
**Then** 显示应用 Logo 和版本信息
**And** 显示嵌入式 Web 服务状态卡片（当前版本、运行状态、端口）
**And** 显示服务启动/停止控制按钮
**And** 显示设置面板（语言选择、服务端口配置）
**And** **不**显示包管理功能（移至独立页面）
**And** **不**显示依赖项管理功能（移至独立页面）
**And** **不**显示远程服务器状态（功能移除）

#### Scenario: 用户从首页控制嵌入式 Web 服务

**Given** 用户在首页仪表盘
**When** 用户点击"启动服务器"或"停止服务器"按钮
**Then** 发送启动/停止请求到嵌入式 Web 服务
**And** 服务状态在 3 秒内更新
**And** 页面显示最新的服务状态和运行端口

#### Scenario: 用户通过菜单导航到管理页面

**Given** 用户在首页仪表盘
**When** 用户点击顶部菜单 "View" → "Dependency Management"
**Then** 应用切换到依赖项管理页面
**And** URL 或内部路由更新为 'dependency'
**And** 页面显示包管理和依赖检测功能

---

## ADDED Requirements

### Requirement: 页面路由和导航

应用 MUST 提供基于顶部菜单的页面路由系统，支持用户在首页、依赖项管理页面和版本管理页面之间切换。

#### Scenario: 菜单触发的页面切换

**Given** 应用正在运行
**When** 用户点击顶部菜单中的页面导航项
**Then** 应用发送 IPC 事件到主进程
**And** 主进程通知渲染进程更新路由状态
**And** 渲染进程切换到对应的页面组件
**And** 菜单项显示选中状态

#### Scenario: 支持的路由类型

**Given** 应用定义路由类型
**When** 枚举所有路由
**Then** 包含 'system'（首页仪表盘）
**And** 包含 'web'（嵌入式 Web 服务视图）
**And** 包含 'dependency'（依赖项管理页面）
**And** 包含 'version'（版本管理页面，预留）

#### Scenario: 路由状态持久化

**Given** 用户切换到某个页面
**When** 用户关闭并重新打开应用
**Then** 应用恢复到上次访问的页面（可选功能）

---

## ADDED Requirements

### Requirement: 依赖项管理独立页面

应用 MUST 提供一个独立的"依赖项管理"页面，集中管理包安装、版本切换和系统依赖检测功能。

#### Scenario: 导航到依赖项管理页面

**Given** 用户在首页或其他页面
**When** 用户通过菜单导航到"依赖项管理"页面
**Then** 显示完整的包管理卡片（PackageManagementCard）
**And** 显示系统依赖检测卡片（DependencyManagementCard）
**And** 页面标题显示"依赖项管理"
**And** 提供返回首页的导航选项

#### Scenario: 在依赖项管理页面安装包

**Given** 用户在依赖项管理页面
**When** 用户选择版本并点击"下载"按钮
**Then** 显示下载进度条
**And** 安装完成后自动刷新包状态
**And** 显示安装成功或失败的通知

#### Scenario: 在依赖项管理页面检查依赖

**Given** 用户在依赖项管理页面
**When** 页面加载或用户点击"刷新"按钮
**Then** 自动检测所有系统依赖（.NET Runtime、Node.js 等）
**And** 显示每个依赖的安装状态和版本信息
**And** 为缺失的依赖提供安装引导

---

## ADDED Requirements

### Requirement: 版本管理页面预留架构

应用 MUST 为"版本管理"页面预留基础架构，包括页面组件框架、路由配置和菜单入口，为未来的版本历史、版本切换和更新日志功能提供扩展点。

#### Scenario: 导航到版本管理页面

**Given** 用户在首页或其他页面
**When** 用户通过菜单导航到"版本管理"页面
**Then** 显示"版本管理"页面框架
**And** 显示占位内容："版本管理功能即将推出"
**And** 页面符合整体 UI 设计风格

#### Scenario: 版本管理页面扩展准备

**Given** 版本管理页面已创建框架
**When** 未来需要实现版本管理功能
**Then** 可以在现有页面组件中添加功能卡片
**And** 不需要修改路由和菜单配置
**And** 可以复用现有的包管理状态和数据

---

## MODIFIED Requirements

### Requirement: 顶部菜单导航

应用 MUST 通过顶部菜单栏提供完整的导航功能，包括首页、依赖项管理、版本管理和设置入口。

#### Scenario: View 菜单结构

**Given** 用户查看应用顶部菜单
**When** 用户点击 "View" 菜单项
**Then** 显示以下子菜单项：
  - "Dashboard"（首页仪表盘）
  - "Dependency Management"（依赖项管理）
  - "Version Management"（版本管理）
  - 分隔线
  - "Open Web Service"（打开嵌入式 Web 服务）

#### Scenario: 菜单点击触发页面切换

**Given** 用户在任意页面
**When** 用户点击 "View" → "Dependency Management"
**Then** 应用切换到依赖项管理页面
**And** 当前页面组件卸载
**And** 依赖项管理页面组件挂载
**And** 菜单项保持选中状态

#### Scenario: 菜单国际化

**Given** 用户切换应用语言
**When** 菜单重新渲染
**Then** 所有菜单项文本显示为新语言
**And** 菜单项功能不受影响
