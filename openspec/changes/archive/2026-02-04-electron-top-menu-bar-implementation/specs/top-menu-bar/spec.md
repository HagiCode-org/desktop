# top-menu-bar Capability Specification

## Purpose

定义 Hagicode Desktop 应用的顶部菜单栏功能，为用户提供统一的导航入口，支持在系统管理和 Web 界面视图之间切换。

## ADDED Requirements

### Requirement: Application Menu Bar

Hagicode Desktop MUST provide a native menu bar at the top of the application window (Windows/Linux) or system menu bar (macOS) that allows users to navigate between different application views and access common functions.

#### Scenario: 应用启动时显示菜单栏

**Given** 应用正在启动
**When** 主窗口创建完成
**Then** 菜单栏在窗口顶部（Windows/Linux）或系统菜单栏（macOS）显示
**And** 菜单项文本使用当前选择的语言（中文或英文）
**And** 默认激活"系统管理"菜单项

#### Scenario: 通过菜单栏切换视图

**Given** 用户当前在系统管理视图
**When** 用户点击菜单栏中的"Hagicode Web"菜单项
**Then** 主窗口内容切换到 Web 视图
**And** 菜单项的选中状态更新
**And** 视图切换在 500ms 内完成

#### Scenario: macOS 平台菜单栏行为

**Given** 应用运行在 macOS 平台
**When** 应用菜单栏创建
**Then** 第一个菜单为应用菜单（Hagicode Desktop）
**And** 应用菜单包含"关于"、"设置"、"退出"等标准选项
**And** 其他菜单显示在系统菜单栏中

---

### Requirement: Menu Internationalization

All menu items MUST support internationalization and dynamically update when the user changes the application language.

#### Scenario: 切换语言后菜单更新

**Given** 应用正在运行且菜单栏已显示
**When** 用户在设置中将语言从中文切换为英文
**Then** 所有菜单项文本在 1 秒内更新为英文
**And** 菜单结构保持不变
**And** 快捷键显示正确

#### Scenario: 菜单翻译完整性检查

**Given** 应用支持中文和英文两种语言
**When** 加载任一语言的菜单文本
**Then** 所有菜单项都有对应语言的翻译
**And** 无 undefined 或缺失的翻译键

---

### Requirement: Keyboard Shortcuts for Menu Navigation

The application MUST provide keyboard shortcuts for common menu actions to allow power users to navigate quickly without using the mouse.

#### Scenario: 使用快捷键切换到系统管理

**Given** 用户当前在任意视图
**When** 用户按下 `CmdOrCtrl+1`
**Then** 应用切换到系统管理视图
**And** 焦点保持在主窗口

#### Scenario: 使用快捷键切换到 Hagicode Web

**Given** 用户当前在任意视图
**When** 用户按下 `CmdOrCtrl+2`
**Then** 应用检查 Web 服务状态
**And** 如果服务运行中，切换到 Web 视图
**And** 如果服务未运行，显示启动确认对话框

#### Scenario: 快捷键冲突处理

**Given** 应用定义了 `CmdOrCtrl+1` 和 `CmdOrCtrl+2` 快捷键
**When** 用户在 Web 视图中按下浏览器快捷键（如 `CmdOrCtrl+R`）
**Then** Web 视图的快捷键优先
**And** 应用菜单快捷键仅在系统管理视图中生效

---

### Requirement: Menu State Persistence

The application MUST remember the last active view and restore it when the application restarts.

#### Scenario: 保存上次打开的视图

**Given** 用户切换到 Web 视图并正常使用
**When** 用户关闭应用
**Then** 当前视图状态（Web）持久化到配置文件
**And** 下次启动应用时自动恢复到 Web 视图

#### Scenario: 应用启动恢复视图

**Given** 用户上次使用时在 Web 视图关闭应用
**When** 应用重新启动
**Then** 主窗口加载完成后显示 Web 视图
**And** 如果 Web 服务未运行，提示用户启动服务

---

### Requirement: View Switching Before Web Service Start

When switching to the Web view, the application MUST check if the embedded web service is running and prompt the user if it needs to be started.

#### Scenario: Web 服务运行时切换

**Given** 嵌入式 Web 服务正在运行
**When** 用户切换到 Web 视图
**Then** 应用直接显示 Web 界面
**And** Web 视图加载服务 URL（如 `http://localhost:36556`）

#### Scenario: Web 服务未启动时切换并确认启动

**Given** 嵌入式 Web 服务当前未运行
**When** 用户切换到 Web 视图
**Then** 应用显示确认对话框，提示用户需要启动 Web 服务
**And** 对话框包含"立即启动"和"取消"按钮
**And** 用户点击"立即启动"后，应用启动服务
**And** 服务启动成功后自动切换到 Web 视图

#### Scenario: Web 服务未启动时切换并取消

**Given** 嵌入式 Web 服务当前未运行
**When** 用户在启动确认对话框中点击"取消"
**Then** 应用保持在当前视图（系统管理）
**And** 不启动 Web 服务

#### Scenario: Web 服务启动失败

**Given** 嵌入式 Web 服务当前未运行
**When** 用户确认启动服务但启动失败（如端口被占用）
**Then** 应用显示错误提示，说明失败原因
**And** 应用保持在系统管理视图
**And** 提供解决方案（如更改端口设置）

---

### Requirement: Menu Help Integration

The menu bar MUST include a Help menu that provides access to documentation, about information, and support resources.

#### Scenario: 显示关于对话框

**Given** 用户点击"帮助"菜单中的"关于"项
**When** 菜单项被点击
**Then** 显示关于对话框
**And** 对话框包含应用名称、版本号、许可证信息

#### Scenario: 打开在线文档

**Given** 用户点击"帮助"菜单中的"文档"项
**When** 菜单项被点击
**Then** 在默认浏览器中打开在线文档页面
**And** 文档 URL 有效且可访问

---

### Requirement: Menu Integration with Existing Features

The menu bar MUST integrate seamlessly with existing application features such as settings, language selection, and service management.

#### Scenario: 通过菜单打开设置

**Given** 用户在任意视图
**When** 用户点击"系统管理"菜单中的"设置"项
**And** 如果当前不在系统管理视图，先切换到系统管理视图
**Then** 滚动到设置卡片位置
**And** 高亮显示设置区域

#### Scenario: 通过菜单启动 Web 服务

**Given** Web 服务当前未运行
**When** 用户点击"Hagicode Web"菜单中的"启动服务"项
**Then** 应用启动 Web 服务
**And** 显示启动进度通知
**And** 启动成功后自动切换到 Web 视图

#### Scenario: 菜单项动态启用/禁用状态

**Given** Web 服务当前未运行
**When** 用户查看"Hagicode Web"菜单
**Then** "打开 Web 界面"菜单项显示为禁用状态
**And** "启动服务"菜单项显示为启用状态
**And** 服务状态变化时菜单项状态自动更新
