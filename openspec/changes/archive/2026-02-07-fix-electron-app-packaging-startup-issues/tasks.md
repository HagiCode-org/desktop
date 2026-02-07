# Implementation Tasks

## 1. 修复 DevTools 自动弹出问题

- [x] 1.1 在 `src/main/main.ts` 中移除第 62 行的生产环境 `openDevTools()` 调用
- [x] 1.2 确保第 56 行的开发环境 `openDevTools()` 调用保持不变
- [x] 1.3 验证 `NODE_ENV` 环境变量在打包时正确设置

## 2. 修复渲染进程加载路径

- [x] 2.1 检查 Vite 构建输出目录配置
- [x] 2.2 验证生产环境下的 `index.html` 路径解析
- [x] 2.3 确认 electron-builder 的 `files` 配置包含渲染进程构建产物
- [x] 2.4 添加更详细的路径日志以便调试
- [ ] 2.5 测试打包后的应用能否正确加载界面

## 3. 验证和测试

- [ ] 3.1 在开发模式下验证 DevTools 仍然可用
- [ ] 3.2 构建生产版本并测试启动
- [ ] 3.3 在 Windows 平台测试打包版本
- [ ] 3.4 在 macOS 平台测试打包版本（如果可能）
- [ ] 3.5 在 Linux 平台测试打包版本
- [ ] 3.6 验证控制台无 "Not allowed to load local resource" 错误

## 4. 文档更新

- [x] 4.1 更新 `openspec/specs/electron-app/spec.md` 添加生产环境 DevTools 禁用要求
- [x] 4.2 确保规范包含打包应用启动成功的场景
