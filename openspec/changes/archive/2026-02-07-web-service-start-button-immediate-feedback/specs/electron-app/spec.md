## ADDED Requirements

### Requirement: 启动按钮即时状态反馈

当用户点击 Web 服务启动/停止按钮时，应用 MUST 立即显示视觉反馈并禁用按钮，防止重复操作。

#### Scenario: 用户点击启动按钮立即显示加载状态

**Given** Web 服务当前处于已停止状态
**When** 用户点击 "启动 Hagicode" 按钮
**Then** 按钮立即显示加载动画（旋转图标）
**And** 按钮立即被禁用（不可点击）
**And** 按钮文本变为 "正在启动..."
**And** UI 状态更新为 `starting`
**And** 整个视觉反馈在 100ms 内完成

#### Scenario: 启动过程中按钮保持禁用状态

**Given** Web 服务正在启动中（status = 'starting'）
**When** 用户尝试再次点击启动按钮
**Then** 按钮保持禁用状态
**And** 不触发新的启动请求
**And** 按钮显示 "正在启动..." 加载动画

#### Scenario: 快速连续点击不触发重复启动

**Given** Web 服务当前处于已停止状态
**When** 用户快速连续点击启动按钮 3 次
**Then** 仅触发一次启动请求
**And** 按钮在第一次点击后立即被禁用
**And** 后续点击被忽略

#### Scenario: 启动成功后按钮状态更新

**Given** Web 服务正在启动中（status = 'starting'）
**When** 启动操作成功完成
**Then** 按钮状态更新为运行中
**And** 按钮变为 "打开应用" 和 "浏览器打开" 两个按钮
**And** 按钮恢复可交互状态

#### Scenario: 启动失败后按钮状态恢复

**Given** Web 服务正在启动中（status = 'starting'）
**When** 启动操作失败
**Then** 按钮状态恢复为停止状态
**And** 按钮恢复为 "启动 Hagicode" 按钮
**And** 按钮恢复可交互状态
**And** 显示错误提示信息

---

## MODIFIED Requirements

### Requirement: Server Control

The application MUST allow users to control Hagicode Server start, stop, and restart operations through the main window. When users initiate a control operation, the application MUST immediately display visual feedback indicating the operation is in progress, and MUST disable the relevant control buttons during the operation to prevent duplicate actions.

#### Scenario: 启动 Hagicode Server

**Given** Hagicode Server 已安装但当前未运行
**When** 用户在主窗口点击 "启动服务器" 按钮
**Then** 应用立即显示加载状态指示器（在 100ms 内）
**And** 按钮立即被禁用，防止重复点击
**And** 应用向服务器发送启动请求
**And** 服务器在 5 秒内开始启动
**And** 应用显示 "服务器正在启动" 通知
**And** 状态更新为 "启动中" 然后变为 "运行中"

#### Scenario: 停止 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在主窗口点击 "停止服务器" 按钮
**Then** 应用立即显示停止进行中的视觉反馈
**And** 按钮立即被禁用
**And** 应用显示确认对话框（如果需要）
**And** 用户确认后向服务器发送停止请求
**And** 应用显示 "服务器正在停止" 通知
**And** 状态更新为 "已停止"

#### Scenario: 重启 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在主窗口点击 "重启服务器" 按钮
**Then** 应用立即显示重启进行中的视觉反馈
**And** 按钮立即被禁用
**And** 应用显示确认对话框（如果需要）
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
**And** 按钮恢复为可交互状态
