# Implementation Tasks: 禁用生产环境中的开发者工具

## Change ID
`disable-devtools-in-production`

## Task Overview
本变更需要修改 `src/main/main.ts` 文件中的两处 `BrowserWindow` 创建配置，确保在生产环境中禁用开发者工具。

---

## Phase 1: 代码修改

### Task 1.1: 修改主窗口配置
**文件**: `src/main/main.ts`

**位置**: 第 82-94 行 (`createWindow` 函数中的 `BrowserWindow` 构造函数)

**操作**:
在 `webPreferences` 对象中添加 `devTools: !app.isPackaged` 配置

**修改前**:
```typescript
mainWindow = new BrowserWindow({
  minWidth: 800,
  minHeight: 600,
  show: false,
  autoHideMenuBar: true,
  icon: iconPath,
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  },
});
```

**修改后**:
```typescript
mainWindow = new BrowserWindow({
  minWidth: 800,
  minHeight: 600,
  show: false,
  autoHideMenuBar: true,
  icon: iconPath,
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    devTools: !app.isPackaged, // 仅在开发环境启用
  },
});
```

**验收标准**:
- [ ] `devTools` 配置已添加到 `webPreferences`
- [ ] 使用 `app.isPackaged` 进行环境检测
- [ ] 代码格式化正确

---

### Task 1.2: 移除生产环境中的 openDevTools 调用
**文件**: `src/main/main.ts`

**位置**: 第 118-120 行

**操作**:
删除临时的 DevTools 打开代码和注释

**修改前**:
```typescript
// Enable DevTools for production to diagnose white screen issue
// TODO: Remove this after white screen issue is resolved
mainWindow.webContents.openDevTools();
```

**修改后**:
```typescript
// (完全移除这三行代码)
```

**验收标准**:
- [ ] 三行代码已完全移除
- [ ] 无多余空行残留
- [ ] 代码格式化正确

---

### Task 1.3: 修改 Hagicode 窗口配置
**文件**: `src/main/main.ts`

**位置**: 第 183-195 行 (`open-hagicode-in-app` IPC 处理器中的 `BrowserWindow` 构造函数)

**操作**:
在 `webPreferences` 对象中添加 `devTools: !app.isPackaged` 配置

**修改前**:
```typescript
const hagicodeWindow = new BrowserWindow({
  minWidth: 800,
  minHeight: 600,
  show: false,
  autoHideMenuBar: true,
  icon: iconPath,
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  },
});
```

**修改后**:
```typescript
const hagicodeWindow = new BrowserWindow({
  minWidth: 800,
  minHeight: 600,
  show: false,
  autoHideMenuBar: true,
  icon: iconPath,
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    devTools: !app.isPackaged, // 仅在开发环境启用
  },
});
```

**验收标准**:
- [ ] `devTools` 配置已添加到 `webPreferences`
- [ ] 使用 `app.isPackaged` 进行环境检测
- [ ] 代码格式化正确

---

## Phase 2: 验证与测试

### Task 2.1: 本地开发环境测试
**命令**: `npm run dev`

**测试步骤**:
1. 启动开发环境
2. 确认 DevTools 窗口自动打开
3. 验证可以使用快捷键（F12、Ctrl+Shift+I）打开 DevTools

**验收标准**:
- [ ] 开发环境 DevTools 自动打开
- [ ] 所有调试功能正常工作

---

### Task 2.2: 生产构建测试
**命令**: `npm run build:local`

**测试步骤**:
1. 执行生产构建
2. 启动打包后的应用
3. 尝试通过快捷键打开 DevTools
4. 尝试通过右键菜单打开 DevTools
5. 验证应用所有功能正常

**验收标准**:
- [ ] DevTools 不会自动打开
- [ ] 快捷键无法打开 DevTools
- [ ] 右键菜单没有"检查元素"选项
- [ ] 应用所有功能正常运行

---

### Task 2.3: 跨平台验证（可选）
**测试平台**: Windows、macOS、Linux

**测试步骤**:
在各平台上重复 Task 2.1 和 Task 2.2 的测试

**验收标准**:
- [ ] Windows 平台测试通过
- [ ] macOS 平台测试通过
- [ ] Linux 平台测试通过

---

## Phase 3: 代码审查与合并

### Task 3.1: 自我代码审查
**检查项**:
- [ ] 所有修改符合 TypeScript 语法规范
- [ ] 代码格式符合项目风格
- [ ] 无引入新的 lint 错误
- [ ] 注释清晰准确

---

### Task 3.2: 提交变更
**提交信息格式**:
```
feat: disable DevTools in production builds

- Add devTools: !app.isPackaged to BrowserWindow webPreferences
- Remove temporary openDevTools() call in production
- Apply change to both main window and Hagicode window

This change prevents end users from accessing developer tools in
production builds, improving security and user experience.

Related: disable-devtools-in-production
```

**验收标准**:
- [ ] 提交信息清晰描述变更内容
- [ ] 包含相关 change ID
- [ ] 遵循项目提交信息规范

---

## 任务依赖关系

```
Phase 1: 代码修改
├── Task 1.1 ─────────────┐
├── Task 1.2 ─────────────┤
└── Task 1.3 ─────────────┤
                        │
                        ▼
Phase 2: 验证与测试      │
├── Task 2.1 ────────────┤
├── Task 2.2 ────────────┤
└── Task 2.3 (可选) ─────┤
                        │
                        ▼
Phase 3: 代码审查与合并  │
├── Task 3.1 ────────────┘
└── Task 3.2 ────────────┘
```

---

## 预估工作量

| 任务 | 预估时间 |
|------|----------|
| Phase 1: 代码修改 | 15 分钟 |
| Phase 2: 验证与测试 | 30 分钟 |
| Phase 3: 代码审查与合并 | 10 分钟 |
| **总计** | **55 分钟** |

---

## 回滚计划

如果变更导致问题，可以：
1. 恢复 `src/main/main.ts` 文件到变更前状态
2. 重新构建并发布

回滚步骤：
```bash
git revert <commit-hash>
npm run build:prod
```
