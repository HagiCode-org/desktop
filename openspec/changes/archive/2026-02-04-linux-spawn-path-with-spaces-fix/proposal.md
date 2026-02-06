# Change: Fix Cross-platform Process Spawning with Spaces in Path

## Why

当用户数据目录路径包含空格时（例如 `/home/user/.config/Hagicode Desktop/pcode-web/installed/linux-x64/start.sh` 或 `C:\Users\user\AppData\Roaming\Hagicode Desktop\pcode-web\installed\win-x64\PCode.Web.exe`），在所有平台上启动 PCode Web 服务可能失败。根本原因是 `web-service-manager.ts` 中进程启动时未正确处理包含空格的可执行文件路径，导致路径被错误解析，进程启动失败（退出码 127）。

## What Changes

- 修复所有平台（Windows、macOS、Linux）上 `PCodeWebServiceManager` 类的进程启动逻辑
- 修改 `getSpawnOptions()` 方法，正确处理包含空格的可执行文件路径
- 确保所有平台在包含空格的路径下都能正常启动 Web 服务
- 为每个平台实施适当的路径引号或参数转义策略

## Impact

- Affected specs: `electron-app` (Server Status Monitoring, Server Control requirements)
- Affected code: `src/main/web-service-manager.ts:86-105` (getSpawnOptions method)
- **No breaking changes** - 修复现有行为，不影响 API 或用户界面
- 向后兼容 - 不影响现有正常工作的安装
- 中风险 - 修改影响所有平台的启动逻辑，需要在各平台上验证
