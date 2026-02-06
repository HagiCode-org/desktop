## ADDED Requirements

### Requirement: Cross-platform Process Spawning with Spaces in Path

The system MUST correctly spawn child processes on all platforms (Windows, macOS, Linux) even when the executable file path or working directory contains spaces.

#### Scenario: Linux 平台路径包含空格时成功启动 Web 服务

**Given** 用户数据目录路径包含空格（如 `/home/user/.config/Hagicode Desktop/pcode-web/installed/linux-x64/start.sh`）
**When** PCodeWebServiceManager 启动 Web 服务进程
**Then** 进程成功启动
**And** 可执行文件路径被正确解析
**And** 进程退出码为 null（进程正在运行）

#### Scenario: Linux 平台路径不包含空格时正常启动 Web 服务

**Given** 用户数据目录路径不包含空格（如 `/home/user/.config/HagicoDesktop/pcode-web/installed/linux-x64/start.sh`）
**When** PCodeWebServiceManager 启动 Web 服务进程
**Then** 进程成功启动
**And** 行为与修复前保持一致
**And** 确保向后兼容性

#### Scenario: Windows 平台路径包含空格时成功启动 Web 服务

**Given** 用户数据目录路径包含空格（如 `C:\Users\user\AppData\Roaming\Hagicode Desktop\pcode-web\installed\win-x64\PCode.Web.exe`）
**When** PCodeWebServiceManager 启动 Web 服务进程
**Then** 进程成功启动
**And** 现有 Windows 启动逻辑不受影响

#### Scenario: macOS 平台路径包含空格时成功启动 Web 服务

**Given** 用户数据目录路径包含空格（如 `/Users/user/Library/Application Support/Hagicode Desktop/pcode-web/installed/osx-x64/PCode.Web`）
**When** PCodeWebServiceManager 启动 Web 服务进程
**Then** 进程成功启动
**And** 现有 macOS 启动逻辑不受影响
