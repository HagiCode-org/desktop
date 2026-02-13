# Change: Electron Single Instance Lock

## Why

当前应用允许用户多次启动，导致多个应用实例同时运行，造成以下问题：
- 多个实例占用重复的系统资源（内存、CPU）
- 嵌入式 Web 服务（默认端口 5000）端口冲突
- electron-store 持久化存储的竞争条件和数据损坏风险
- 系统托盘出现多个图标，用户无法区分活动实例
- Redux 状态、IPC 通道等资源被重复初始化

## What Changes

- 在 `src/main/main.ts` 中添加 Electron 单实例锁定机制
- 使用 `app.requestSingleInstanceLock()` API 获取单一实例锁
- 处理 `second-instance` 事件，聚焦已运行实例的主窗口
- 未能获取锁时使用 `app.quit()` 优雅退出
- 添加日志记录单实例锁定事件

## Impact

- 受影响的规范：`specs/electron-app/spec.md`（新增单实例要求）
- 受影响的代码：`src/main/main.ts`（应用入口点）
- 受影响的平台：Windows、macOS、Linux
