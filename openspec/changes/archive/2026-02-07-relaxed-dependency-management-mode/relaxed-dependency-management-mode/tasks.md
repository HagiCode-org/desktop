## 1. 主进程修改

- [ ] 1.1 修改 `main.ts` 中的 `start-web-service` IPC 处理器
  - [ ] 1.1.1 移除对版本状态 `installed-ready` 的硬性检查
  - [ ] 1.1.2 修改返回值，添加 `warning` 字段用于传递警告信息
  - [ ] 1.1.3 确保服务启动逻辑不因依赖不满足而失败

- [ ] 1.2 修改 `version-manager.ts` 中的 `switchVersion` 方法
  - [ ] 1.2.1 移除版本状态检查（第 370-373 行）
  - [ ] 1.2.2 允许切换到任何已安装版本
  - [ ] 1.2.3 保持版本状态在状态管理中更新

## 2. Redux 状态管理

- [ ] 2.1 扩展 `webServiceSlice.ts` 状态
  - [ ] 2.1.1 新增 `dependencyWarningDismissed: boolean` 状态
  - [ ] 2.1.2 新增 `showDependencyWarning: boolean` 状态
  - [ ] 2.1.3 新增 `missingDependenciesList: DependencyItem[]` 状态
  - [ ] 2.1.4 添加 `setDependencyWarningDismissed` action
  - [ ] 2.1.5 添加 `setShowDependencyWarning` action
  - [ ] 2.1.6 添加 `setMissingDependenciesList` action
  - [ ] 2.1.7 添加相应的 selectors

- [ ] 2.2 修改 `webServiceSaga.ts`
  - [ ] 2.2.1 修改 `startWebServiceSaga` 处理依赖警告
  - [ ] 2.2.2 添加 `showStartConfirmDialog` action
  - [ ] 2.2.3 添加 `confirmStartWithWarning` action
  - [ ] 2.2.4 实现确认对话框 saga

## 3. UI 组件

- [ ] 3.1 创建 `DependencyStartConfirmDialog.tsx` 组件
  - [ ] 3.1.1 使用 shadcn/ui Dialog 组件
  - [ ] 3.1.2 显示缺失的依赖项列表
  - [ ] 3.1.3 显示潜在风险说明
  - [ ] 3.1.4 提供"仍然启动"和"取消"按钮
  - [ ] 3.1.5 为每个依赖项提供快捷操作按钮

- [ ] 3.2 创建 `DependencyWarningBanner.tsx` 组件
  - [ ] 3.2.1 使用 Alert 或 Banner 风格显示
  - [ ] 3.2.2 显示缺失依赖项数量
  - [ ] 3.2.3 提供"查看详情"按钮跳转到依赖管理页面
  - [ ] 3.2.4 提供"稍后修复"按钮暂时关闭
  - [ ] 3.2.5 提供关闭按钮（带 `×` 图标）
  - [ ] 3.2.6 支持用户手动关闭后重启服务重新显示

- [ ] 3.3 集成到现有组件
  - [ ] 3.3.1 在 `App.tsx` 中添加 `DependencyStartConfirmDialog`
  - [ ] 3.3.2 在 `WebServiceStatusCard.tsx` 中集成 `DependencyWarningBanner`
  - [ ] 3.3.3 在 `VersionManagementPage.tsx` 中添加版本切换后的警告提示

## 4. 国际化

- [ ] 4.1 添加中文翻译 (`zh-CN/components.json`)
  - [ ] 4.1.1 添加 `dependencyStartConfirm` 命名空间
  - [ ] 4.1.2 添加标题、描述、警告文本
  - [ ] 4.1.3 添加按钮文本
  - [ ] 4.1.4 添加 `dependencyWarningBanner` 命名空间
  - [ ] 4.1.5 添加横幅文本和按钮

- [ ] 4.2 添加英文翻译 (`en-US/components.json`)
  - [ ] 4.2.1 添加 `dependencyStartConfirm` 命名空间
  - [ ] 4.2.2 添加标题、描述、警告文本
  - [ ] 4.2.3 添加按钮文本
  - [ ] 4.2.4 添加 `dependencyWarningBanner` 命名空间
  - [ ] 4.2.5 添加横幅文本和按钮

## 5. 日志和审计

- [ ] 5.1 添加操作日志
  - [ ] 5.1.1 在主进程记录用户选择"仍然启动"的操作
  - [ ] 5.1.2 记录服务启动时的依赖状态
  - [ ] 5.1.3 记录版本切换时的依赖状态

## 6. 测试

- [ ] 6.1 功能测试
  - [ ] 6.1.1 测试依赖不满足时显示确认对话框
  - [ ] 6.1.2 测试用户选择"仍然启动"后服务正常启动
  - [ ] 6.1.3 测试用户选择"取消"后服务保持停止
  - [ ] 6.1.4 测试启动后警告横幅正确显示
  - [ ] 6.1.5 测试切换到未就绪版本后正确显示警告
  - [ ] 6.1.6 测试用户手动关闭警告横幅
  - [ ] 6.1.7 测试重启服务后警告横幅重新显示

- [ ] 6.2 兼容性测试
  - [ ] 6.2.1 测试依赖满足时正常启动（无对话框）
  - [ ] 6.2.2 测试切换到就绪版本时无警告
  - [ ] 6.2.3 测试手动安装依赖后警告消失

## 7. 文档

- [ ] 7.1 更新依赖管理规范
  - [ ] 7.1.1 添加宽松模式场景描述
  - [ ] 7.1.2 更新依赖检查行为说明
