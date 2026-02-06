## 1. Main Process Implementation

- [ ] 1.1 在 `package-manager.ts` 中添加 `reinstallPackage()` 方法
  - [ ] 1.1.1 实现缓存清理逻辑（删除指定版本的缓存文件）
  - [ ] 1.1.2 调用现有的 `removeInstalled()` 方法删除已安装版本
  - [ ] 1.1.3 调用现有的 `installPackage()` 或 `installFromSource()` 重新安装
  - [ ] 1.1.4 在各阶段发送进度更新

- [ ] 1.2 在 `main.ts` 中添加 `package:reinstall` IPC 处理器
  - [ ] 1.2.1 注册 IPC 通道 `ipcMain.handle('package:reinstall', ...)`
  - [ ] 1.2.2 调用 `packageManager.reinstallPackage(versionIdentifier)`
  - [ ] 1.2.3 处理错误并返回适当的结果

## 2. IPC Bridge (Preload)

- [ ] 2.1 在 `preload/index.ts` 中暴露重装 API
  - [ ] 2.1.1 添加 `reinstallPackage: (versionIdentifier) => ipcRenderer.invoke('package:reinstall', versionIdentifier)`

## 3. Renderer State Management

- [ ] 3.1 在 `packageSourceSlice.ts` 中添加重装状态
  - [ ] 3.1.1 添加 `isReinstalling` 状态
  - [ ] 3.1.2 添加 `reinstallProgress` 状态
  - [ ] 3.1.3 添加 `startReinstall`、`reinstallSuccess`、`reinstallFailure` actions

- [ ] 3.2 在 `packageSourceSaga.ts` 中实现重装异步操作
  - [ ] 3.2.1 创建 `reinstallPackageAction` action creator
  - [ ] 3.2.2 实现 saga worker 处理重装流程
  - [ ] 3.2.3 处理成功和失败情况

## 4. UI Components

- [ ] 4.1 在 `PackageManagementCard.tsx` 中添加重装按钮
  - [ ] 4.1.1 检测当前选择的版本是否已安装
  - [ ] 4.1.2 当已安装时显示"重新安装"按钮
  - [ ] 4.1.3 添加按钮点击处理函数

- [ ] 4.2 实现重装确认对话框
  - [ ] 4.2.1 使用 AlertDialog 或 Dialog 组件
  - [ ] 4.2.2 显示版本信息和操作说明
  - [ ] 4.2.3 提供"取消"和"重新安装"按钮

- [ ] 4.3 更新进度显示
  - [ ] 4.3.1 重用现有的进度显示组件
  - [ ] 4.3.2 为重装操作添加阶段描述（清理缓存、删除旧版本、下载、安装）

- [ ] 4.4 添加成功/失败通知
  - [ ] 4.4.1 使用 toast 组件显示结果
  - [ ] 4.4.2 重装成功后刷新包信息
  - [ ] 4.4.3 重装失败后显示错误详情

## 5. Internationalization

- [ ] 5.1 添加英文翻译到 `en-US/components.json`
  - [ ] 5.1.1 `packageManagement.reinstallButton`: "Reinstall"
  - [ ] 5.1.2 `packageManagement.reinstallConfirmTitle`: "Confirm Reinstallation"
  - [ ] 5.1.3 `packageManagement.reinstallConfirmMessage`: "You are about to reinstall version {version}..."
  - [ ] 5.1.4 `packageManagement.reinstallProgress.clearingCache`: "Clearing cache..."
  - [ ] 5.1.5 `packageManagement.reinstallProgress.removingOld`: "Removing old version..."
  - [ ] 5.1.6 `packageManagement.reinstallProgress.downloading`: "Downloading..."
  - [ ] 5.1.7 `packageManagement.reinstallProgress.installing`: "Installing..."
  - [ ] 5.1.8 `packageManagement.reinstallSuccess`: "Reinstalled successfully"
  - [ ] 5.1.9 `packageManagement.reinstallFailed`: "Reinstallation failed"

- [ ] 5.2 添加中文翻译到 `zh-CN/components.json`
  - [ ] 5.2.1 对应上述所有键的中文翻译

## 6. Testing

- [ ] 6.1 测试重装流程
  - [ ] 6.1.1 测试正常重装流程（完整执行所有步骤）
  - [ ] 6.1.2 测试重装过程中的进度显示
  - [ ] 6.1.3 测试用户取消确认对话框的情况
  - [ ] 6.1.4 测试重装失败场景（网络错误、磁盘空间不足等）

- [ ] 6.2 测试边界情况
  - [ ] 6.2.1 测试缓存不存在时的重装
  - [ ] 6.2.2 测试已安装版本不存在时的重装
  - [ ] 6.2.3 测试重装过程中的应用关闭和重启

- [ ] 6.3 测试 UI 交互
  - [ ] 6.3.1 验证重装按钮仅在已安装版本时显示
  - [ ] 6.3.2 验证确认对话框的正确显示
  - [ ] 6.3.3 验证成功和失败通知的显示

## 7. Documentation

- [ ] 7.1 更新相关文档
  - [ ] 7.1.1 如有需要，更新用户手册
  - [ ] 7.1.2 在代码中添加必要的注释
