# 实施任务清单

## 1. 准备工作
- [x] 1.1 阅读并理解 `proposal.md`
- [x] 1.2 查看现有的 `electron-app` 规范
- [x] 1.3 检查是否存在相关的活跃变更冲突

## 2. 类型定义更新
- [x] 2.1 更新 `src/renderer/store/slices/viewSlice.ts`
  - [x] 在 `ViewType` 类型中添加 `'settings'`
  - [x] 验证类型定义正确性

## 3. IPC 通信实现
- [x] 3.1 在 `src/main/main.ts` 中添加 IPC 处理器
  - [x] 添加 `reset-onboarding` IPC 处理器
  - [x] 调用 `OnboardingManager.resetOnboarding()` 方法
  - [x] 返回操作结果给渲染进程
  - [x] 发送 `onboarding:show` 事件触发引导向导显示

- [x] 3.2 添加调试模式 IPC 处理器 [NEW]
  - [x] 添加 `set-debug-mode` IPC 处理器
  - [x] 接收 `{ ignoreDependencyCheck: boolean }` 参数
  - [x] 将调试模式状态保存到 electron-store
  - [x] 发送 `debug-mode-changed` 事件通知渲染进程
  - [x] 添加 `get-debug-mode` IPC 处理器获取当前调试状态

## 4. TypeScript 类型声明
- [x] 4.1 更新 `src/renderer/App.tsx` 中的全局类型声明
  - [x] 添加 `resetOnboarding: () => Promise<{ success: boolean; error?: string }>` 到 `electronAPI`
  - [x] 添加 `setDebugMode: (mode: { ignoreDependencyCheck: boolean }) => Promise<{ success: boolean; error?: string }>` 到 `electronAPI` [NEW]
  - [x] 添加 `getDebugMode: () => Promise<{ ignoreDependencyCheck: boolean }>` 到 `electronAPI` [NEW]
  - [x] 添加 `onDebugModeChanged: (callback: (mode: { ignoreDependencyCheck: boolean }) => void) => void` 到 `electronAPI` [NEW]

## 5. 设置页面组件实现
- [x] 5.1 创建 `src/renderer/components/SettingsPage.tsx`
  - [x] 使用 Radix UI 的 Tabs 组件实现垂直布局
  - [x] 创建「启动向导」Tab
  - [x] 创建「调试」Tab [NEW]
  - [x] 添加页面标题和基础布局结构

- [x] 5.2 创建 `src/renderer/components/settings/OnboardingSettings.tsx`
  - [x] 实现启动向导设置组件
  - [x] 添加描述文本
  - [x] 实现「重新启动向导」按钮
  - [x] 添加按钮点击事件处理，调用 `window.electronAPI.resetOnboarding()`
  - [x] 添加成功/失败反馈

- [x] 5.3 创建 `src/renderer/components/settings/DebugSettings.tsx` [NEW]
  - [x] 实现调试设置组件
  - [x] 添加描述文本
  - [x] 实现「忽略依赖检查」开关
  - [x] 添加开关状态管理（从主进程获取初始状态）
  - [x] 添加开关变更事件处理，调用 `window.electronAPI.setDebugMode()`
  - [x] 监听 `debug-mode-changed` 事件更新开关状态
  - [x] 添加成功/失败反馈

## 6. 侧边栏导航更新
- [x] 6.1 更新 `src/renderer/components/SidebarNavigation.tsx`
  - [x] 在 `navigationItems` 数组中添加设置项
  - [x] 使用 `Settings` 图标（已从 lucide-react 导入）
  - [x] 添加 `labelKey: 'sidebar.settings'`
  - [x] 设置 `id: 'settings'`

## 7. 主应用更新
- [x] 7.1 更新 `src/renderer/App.tsx`
  - [x] 在视图渲染区域添加 `settings` 视图的条件渲染
  - [x] 添加 `{currentView === 'settings' && <SettingsPage />}`

## 8. 国际化翻译
- [x] 8.1 更新 `src/renderer/i18n/locales/zh-CN/common.json`
  - [x] 在 `sidebar` 对象中添加 `"settings": "设置"`
  - [x] 添加其他相关翻译键

- [x] 8.2 更新 `src/renderer/i18n/locales/en-US/common.json`
  - [x] 在 `sidebar` 对象中添加 `"settings": "Settings"`
  - [x] 添加其他相关翻译键（英文）

- [x] 8.3 更新 `src/renderer/i18n/locales/zh-CN/pages.json`
  - [x] 添加设置页面相关翻译键
  - [x] 添加「启动向导」Tab 翻译键
  - [x] 添加「调试」Tab 翻译键 [NEW]
  - [x] 添加「忽略依赖检查」相关翻译键 [NEW]

- [x] 8.4 更新 `src/renderer/i18n/locales/en-US/pages.json`
  - [x] 添加设置页面相关翻译键（英文）
  - [x] 添加「Onboarding」Tab 翻译键
  - [x] 添加「Debug」Tab 翻译键 [NEW]
  - [x] 添加「Ignore dependency check」相关翻译键 [NEW]

## 9. 规范增量文件
- [x] 9.1 创建 `openspec/changes/settings-page-and-onboarding-reset-arg-value/specs/electron-app/spec.md`
  - [x] 添加设置页面的需求规范
  - [x] 添加启动向导重置功能的需求规范
  - [x] 添加调试模式开关的需求规范 [NEW]
  - [x] 使用 `## ADDED Requirements` 格式
  - [x] 每个需求至少包含一个 `#### Scenario:`

## 9.5 依赖检查逻辑更新 [NEW]
- [x] 9.5.1 确定依赖检查逻辑的位置
  - [x] 搜索现有的依赖检查相关代码
  - [x] 确定需要修改的组件或函数

- [x] 9.5.2 修改依赖检查逻辑
  - [x] 添加调试模式状态检查
  - [x] 当 `ignoreDependencyCheck` 为 true 时，强制返回未安装状态
  - [x] 确保逻辑不影响正常的依赖检查

## 10. 测试验证
- [x] 10.1 编译检查
  - [x] 运行 `npm run build:tsc:check` 检查 TypeScript 编译
  - [x] 确保无编译错误

- [x] 10.2 功能测试
  - [x] 启动应用，验证设置菜单项显示
  - [x] 点击设置菜单，验证设置页面正确显示
  - [x] 验证垂直 Tabs 布局正确
  - [x] 验证「启动向导」Tab 显示正确
  - [x] 验证「调试」Tab 显示正确 [NEW]
  - [x] 点击「重新启动向导」按钮，验证引导状态重置
  - [x] 验证引导向导重新出现
  - [x] 点击「忽略依赖检查」开关，验证状态保存 [NEW]
  - [x] 验证调试模式开启后，依赖项显示为未安装 [NEW]
  - [x] 验证调试模式关闭后，依赖项恢复正常 [NEW]
  - [x] 重启应用，验证调试模式状态保持 [NEW]

- [x] 10.3 国际化测试
  - [x] 切换到中文，验证所有中文翻译正确显示
  - [x] 切换到英文，验证所有英文翻译正确显示

- [x] 10.4 提案验证
  - [x] 运行 `openspec validate settings-page-and-onboarding-reset-arg-value --strict`
  - [x] 修复任何验证错误

## 11. 文档更新
- [x] 11.1 确保所有新文件都有适当的注释
- [x] 11.2 更新相关文档（如需要）

## 12. 完成检查
- [x] 12.1 确认所有任务已完成
- [x] 12.2 确认无编译错误
- [x] 12.3 确认提案验证通过
- [x] 12.4 将此文件中的所有任务标记为 `[x]` 完成状态
