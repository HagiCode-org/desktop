# Implementation Tasks

## 1. Code Changes

- [x] 1.1 修改 `src/main/main.ts` 中的 `createWindow()` 函数
  - [x] 移除 `BrowserWindow` 配置中的 `width: 1200` 参数
  - [x] 移除 `BrowserWindow` 配置中的 `height: 800` 参数
  - [x] 保留 `minWidth: 800` 最小宽度约束
  - [x] 保留 `minHeight: 600` 最小高度约束
  - [x] 保留 `show: false` 配置，确保窗口在准备好之前不显示

- [x] 1.2 在 `ready-to-show` 事件处理器中添加最大化逻辑
  - [x] 在 `mainWindow.once('ready-to-show', ...)` 回调中
  - [x] 在 `mainWindow.show()` 之前添加 `mainWindow.maximize()` 调用
  - [x] 确保最大化操作在窗口显示之前完成

- [x] 1.3 添加 `open-hagicode-in-app` IPC 处理程序
  - [x] 在 `src/main/main.ts` 中添加新的 IPC 处理程序
  - [x] 实现 `loadURL()` 加载 Web Service URL
  - [x] 在加载后调用 `maximize()` 最大化窗口
  - [x] 在 `src/preload/index.ts` 中暴露 `openHagicodeInApp` API

- [x] 1.4 修改"打开 Hagicode"按钮功能
  - [x] 修改 `src/renderer/components/WebServiceStatusCard.tsx` 中的 `handleOpenHagicode` 函数
  - [x] 使用 `window.electronAPI.openHagicodeInApp()` 替代 `window.open()`
  - [x] 确保点击"打开 Hagicode"按钮时在应用内打开并最大化

## 2. Testing

- [ ] 2.1 Windows 平台验证
  - [ ] 在 Windows 10/11 上启动应用
  - [ ] 验证窗口启动时为最大化状态
  - [ ] 验证可以点击还原按钮恢复正常窗口
  - [ ] 验证可以手动调整窗口大小
  - [ ] 验证窗口不能缩小到小于最小尺寸

- [ ] 2.2 macOS 平台验证
  - [ ] 在 macOS 11+ 上启动应用
  - [ ] 验证窗口启动时为最大化状态（全屏模式或绿色按钮最大化）
  - [ ] 验证可以点击绿色按钮恢复正常窗口
  - [ ] 验证可以手动调整窗口大小
  - [ ] 验证窗口不能缩小到小于最小尺寸

- [ ] 2.3 Linux 平台验证
  - [ ] 在 Ubuntu/Fedora 等 Linux 发行版上启动应用
  - [ ] 验证窗口启动时为最大化状态
  - [ ] 验证可以点击还原按钮恢复正常窗口
  - [ ] 验证可以手动调整窗口大小
  - [ ] 验证窗口不能缩小到小于最小尺寸

## 3. Documentation

- [x] 3.1 更新相关规范文档
  - [x] 确认 `specs/electron-app/spec.md` 中的窗口行为描述准确反映新行为
  - [x] 添加"窗口最大化启动和调整"场景规范

## 4. In-App Window Opening (Bonus)

- [x] 4.1 实现"打开 Hagicode"应用内打开功能
  - [x] 添加 `open-hagicode-in-app` IPC 处理程序
  - [x] 在应用窗口中加载 Web Service URL
  - [x] 确保打开时窗口最大化
  - [x] 修改前端组件使用新 API
