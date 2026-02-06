## MODIFIED Requirements

### Requirement: Server Control

The application MUST allow users to control Hagicode Server start, stop, and restart operations through the main window.

#### Scenario: 停止 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在主窗口点击 "停止服务器" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后向服务器发送停止请求
**And** 应用显示 "服务器正在停止" 通知
**And** 状态更新为 "已停止"
**And** URL 和 PID 状态字段被正确重置为 `null`

#### Scenario: 启动 Hagicode Server

**Given** Hagicode Server 已安装但当前未运行
**When** 用户在主窗口点击 "启动服务器" 按钮
**Then** 应用向服务器发送启动请求
**And** 显示加载状态指示器
**And** 服务器在 5 秒内开始启动
**And** 应用显示 "服务器正在启动" 通知
**And** 状态更新为 "启动中" 然后变为 "运行中"

#### Scenario: 重启 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在主窗口点击 "重启服务器" 按钮
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
