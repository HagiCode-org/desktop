# electron-app Specification Delta

## MODIFIED Requirements

### Requirement: Server Control

The application MUST allow users to control Hagicode Server start, stop, and restart operations through the main window. The application SHALL use standardized startup scripts (`start.bat` on Windows, `start.sh` on macOS/Linux) when available, with fallback to direct `dotnet` command execution for backward compatibility.

#### Scenario: 启动 Hagicode Server

**Given** Hagicode Server 已安装但当前未运行
**When** 用户在主窗口点击 "启动服务器" 按钮
**Then** 应用首先检查是否存在标准化启动脚本（`start.bat` 或 `start.sh`）
**And** 如果脚本存在，则使用该脚本启动服务
**And** 如果脚本不存在，则回退到使用 `dotnet` 命令直接启动
**And** 应用在日志中记录使用的启动方式（脚本或直接命令）
**And** 显示加载状态指示器
**And** 服务器在 5 秒内开始启动
**And** 应用显示 "服务器正在启动" 通知
**And** 状态更新为 "启动中" 然后变为 "运行中"

#### Scenario: 使用脚本启动服务（优先方式）

**Given** Hagicode Server 部署包包含标准化启动脚本
**When** 应用启动服务
**Then** 应用优先执行平台对应的启动脚本
**And** Windows 平台执行 `[deployment-path]/start.bat`
**And** macOS/Linux 平台执行 `[deployment-path]/start.sh`
**And** 脚本以部署包目录作为工作目录执行
**And** 启动日志显示 "Using startup script: [script-path]"

#### Scenario: 回退到 dotnet 命令启动

**Given** Hagicode Server 部署包不包含标准化启动脚本
**When** 应用启动服务
**Then** 应用回退到直接使用 `dotnet` 命令启动
**And** 命令格式为 `dotnet [dll-path]`
**And** 工作目录设置为 DLL 所在目录
**And** 启动日志显示 "Using fallback dotnet command: dotnet [dll-path]"

#### Scenario: 停止 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在主窗口点击 "停止服务器" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后向服务器发送停止请求
**And** 应用显示 "服务器正在停止" 通知
**And** 状态更新为 "已停止"

#### Scenario: 重启 Hagicode Server

**Given** Hagicode Server 正在运行
**When** 用户在主窗口点击 "重启服务器" 按钮
**Then** 应用显示确认对话框
**And** 用户确认后先停止再启动服务器
**And** 启动时同样遵循脚本优先、回退到 dotnet 的逻辑
**And** 应用显示进度通知
**And** 服务器成功重启后状态更新为 "运行中"

#### Scenario: 服务器控制失败处理

**Given** 用户尝试控制服务器（启动/停止/重启）
**When** 服务器返回错误或无响应
**Then** 应用显示错误消息对话框
**And** 错误消息包含具体失败原因
**And** 应用记录错误日志
**And** 状态显示为 "错误"
