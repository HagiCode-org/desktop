# Implementation Tasks

## 1. Code Changes

- [x] 1.1 修改 `src/main/web-service-manager.ts` 中的 `getSpawnOptions()` 方法，为所有平台的可执行文件路径添加正确的引号包裹或参数转义
- [x] 1.2 Linux 平台：使用 `sh -c` 命令执行带有引号的路径和参数组合
- [x] 1.3 Windows 平台：确保 `.exe` 路径包含空格时能正确启动（可能需要转义或引号）
- [x] 1.4 macOS 平台：确保可执行文件路径包含空格时能正确启动
- [x] 1.5 验证所有平台的参数传递逻辑保持一致

## 2. Testing

- [x] 2.1 在 Linux 环境中测试路径包含空格时的 Web 服务启动（如 `/home/user/.config/Hagico Desktop`）
- [x] 2.2 在 Linux 环境中测试路径不包含空格时的 Web 服务启动，确保向后兼容性
- [x] 2.3 在 Windows 环境中测试路径包含空格时的 Web 服务启动（如 `C:\Users\user\AppData\Roaming\Hagico Desktop`）
- [x] 2.4 在 Windows 环境中测试路径不包含空格时的 Web 服务启动
- [x] 2.5 在 macOS 环境中测试路径包含空格时的 Web 服务启动（如 `/Users/user/Library/Application Support/Hagico Desktop`）
- [x] 2.6 在 macOS 环境中测试路径不包含空格时的 Web 服务启动
- [x] 2.7 验证进程启动后的健康检查功能正常工作
- [x] 2.8 验证进程停止和重启功能正常工作

## 3. Verification

- [x] 3.1 运行 `openspec validate linux-spawn-path-with-spaces-fix --strict` 确保提案通过验证
- [x] 3.2 检查相关代码没有引入新的 linting 错误
- [x] 3.3 确认所有测试场景通过
