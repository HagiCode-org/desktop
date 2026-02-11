# Proposal: 禁用生产环境中的开发者工具

## Change ID
`disable-devtools-in-production`

## Status
**ExecutionCompleted**

## Overview
确保 Hagicode Desktop 应用在生产环境中完全禁用开发者工具（DevTools），仅在开发模式下保留该功能。

## Context

Hagicode Desktop 是一个基于 Electron 的跨平台桌面应用程序。当前在发布版本中，开发者工具默认处于打开状态，这暴露了应用程序的内部实现细节，包括：
- 控制台日志和调试信息
- 网络请求详情
- 本地存储内容
- React DevTools 和 Redux DevTools 信息

## Problem Statement

### 当前状态
1. **主窗口 (`createWindow` 函数)**：
   - 第 105 行：开发环境下显式调用 `mainWindow.webContents.openDevTools()`
   - 第 118-120 行：生产环境中存在临时的 `openDevTools()` 调用（带有 TODO 注释）

2. **Hagicode 窗口 (`open-hagicode-in-app` IPC 处理器)**：
   - 第 183-195 行：创建的 `BrowserWindow` 没有设置 `devTools: false`

### 安全风险
- 泄露敏感的 API 端点和内部逻辑
- 暴露用户配置和许可证信息
- 可能被用于逆向工程和安全分析
- 违反 Electron 安全最佳实践

### 用户体验影响
- 不必要的窗口占用屏幕空间
- 可能导致普通用户误操作
- 影响应用的成品感和专业度

## Proposed Solution

### 核心方法
使用 `app.isPackaged` 属性检测应用是否已打包，在生产环境中禁用开发者工具。

### 实施方案

#### 1. 主窗口修改
在 `BrowserWindow` 构造函数的 `webPreferences` 中添加条件性的 `devTools` 配置：

```typescript
mainWindow = new BrowserWindow({
  // ... 其他配置
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    devTools: !app.isPackaged, // 仅在开发环境启用
  },
});
```

#### 2. 移除生产环境中的 openDevTools 调用
删除第 118-120 行的临时代码和注释：
```typescript
// 移除以下代码：
// // Enable DevTools for production to diagnose white screen issue
// // TODO: Remove this after white screen issue is resolved
// mainWindow.webContents.openDevTools();
```

#### 3. Hagicode 窗口修改
同样在 `open-hagicode-in-app` 处理器中创建的窗口添加 `devTools` 配置。

#### 4. 开发环境保留
- 第 105 行的开发环境 `openDevTools()` 调用保持不变
- 使用 `app.isPackaged` 替代 `process.env.NODE_ENV` 进行环境检测（更可靠）

## Impact Assessment

### 安全性提升
- 防止终端用户访问开发者工具
- 保护应用内部实现和敏感信息
- 符合 Electron 生产环境安全标准

### 用户体验改进
- 更整洁的应用界面
- 更专业的桌面应用表现
- 减少误操作风险

### 开发流程
- 不影响开发调试能力
- 构建流程无需变更
- 现有的开发命令继续可用

### 风险评估
| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 移除调试代码后问题难以排查 | 低 | 中 | 使用 electron-log 日志系统 |
| 开发环境检测失效 | 低 | 低 | `app.isPackaged` 是 Electron 标准API |

## Scope

### 包含的更改
- `src/main/main.ts` - 主窗口和 Hagicode 窗口的 `BrowserWindow` 配置

### 不包含的更改
- 构建配置（无需修改）
- 预加载脚本（无需修改）
- 渲染进程代码（无需修改）

## Success Criteria

1. 生产构建中无法通过任何方式打开 DevTools
2. 开发模式下 DevTools 自动打开（行为保持不变）
3. 应用在打包后正常运行，无功能退化
4. 所有平台（Windows、macOS、Linux）行为一致

## Alternatives Considered

### 方案 A：使用环境变量
使用 `process.env.NODE_ENV` 检测环境。
- **缺点**：依赖构建时设置的环境变量，不如 `app.isPackaged` 可靠

### 方案 B：使用命令行参数
通过 `--disable-devtools` 标志禁用。
- **缺点**：需要修改启动脚本，增加复杂度

### 选定方案：使用 `app.isPackaged`
- **优点**：Electron 内置 API，简单可靠，无需额外配置

## Related Issues
无

## References
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [BrowserWindow Constructor Options](https://www.electronjs.org/docs/latest/api/browser-window#new-browserwindowoptions)
