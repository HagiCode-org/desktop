# Implementation Tasks

## 1. 状态管理扩展

- [ ] 1.1 在 `webServiceSlice.ts` 中添加 `InstallState` 枚举
  - 定义状态值：`Idle`, `Confirming`, `StoppingService`, `Installing`, `Completed`, `Error`
  - 添加 JSDoc 注释说明每个状态的用途

- [ ] 1.2 扩展 `WebServiceState` 接口
  - 添加 `installState: InstallState` 字段
  - 更新 `initialState` 对象，设置 `installState` 为 `InstallState.Idle`

- [ ] 1.3 添加 `setInstallState` action 和 reducer
  - 创建 action creator 用于更新安装状态
  - 实现 reducer 逻辑处理状态更新

- [ ] 1.4 添加安装状态相关的 selectors
  - 创建 `selectInstallState` selector
  - 创建 `selectIsInstalling` selector（用于判断是否正在安装）
  - 创建 `selectCanInstall` selector（用于判断是否可以执行安装）

## 2. Redux Saga 修改

- [ ] 2.1 更新 `installWebServicePackageSaga` 函数
  - 在开始安装时设置 `installState` 为 `Installing`
  - 优化错误处理逻辑，确保状态正确重置

- [ ] 2.2 提取 `doInstallPackage` 辅助函数
  - 从 `installWebServicePackageSaga` 中提取安装逻辑
  - 添加详细的状态更新和进度报告
  - 集成 Toast 通知（成功和失败）

- [ ] 2.3 更新 `confirmInstallAndStopSaga` 函数
  - 添加状态转换逻辑：`Confirming` → `StoppingService` → `Installing`
  - 确保服务停止失败时正确设置错误状态

- [ ] 2.4 添加状态重置逻辑
  - 在安装成功后延迟 3 秒重置状态为 `Idle`
  - 在安装失败后立即重置状态为 `Idle`
  - 在用户取消确认对话框时重置状态为 `Idle`

## 3. UI 组件更新

- [ ] 3.1 修改 `VersionManagementPage.tsx` 中的安装按钮
  - 从 Redux store 获取 `installState` 和 `isInstalling` 状态
  - 根据 `installState` 条件渲染不同的按钮内容
  - 添加 loading spinner（使用 `Loader2` 图标和 `animate-spin` 类）
  - 添加 `disabled` 属性，当 `isInstalling` 或 `webServiceOperating` 时禁用按钮

- [ ] 3.2 更新安装按钮的条件渲染逻辑
  - **正常状态**：显示 `Download` 图标和"安装"文本
  - **Loading 状态**：显示 spinner 和"安装中..."文本
  - **已安装状态**：显示 `CheckCircle` 图标和"已安装"标签（现有逻辑保持不变）

- [ ] 3.3 修改重新安装按钮
  - 应用与安装按钮相同的 loading 状态逻辑
  - Loading 时显示"重新安装中..."文本
  - 确保其他操作按钮（查看依赖、打开日志）在重新安装时保持可用

- [ ] 3.4 优化确认对话框的显示时机
  - 确保对话框显示时安装按钮保持正常状态（不显示 loading）
  - 用户取消对话框后正确重置状态

## 4. 国际化文本添加

- [ ] 4.1 在 `src/renderer/i18n/locales/zh-CN/pages.json` 中添加中文翻译
  - 添加 `versionManagement.installing` = "安装中..."
  - 添加 `versionManagement.reinstalling` = "重新安装中..."
  - 确认 Toast 通知文本已存在（`versionManagement.toast.installSuccess`, `versionManagement.toast.installFailed`）

- [ ] 4.2 在 `src/renderer/i18n/locales/en-US/pages.json` 中添加英文翻译
  - 添加 `versionManagement.installing` = "Installing..."
  - 添加 `versionManagement.reinstalling` = "Reinstalling..."
  - 确认 Toast 通知文本已存在或添加英文版本

## 5. 测试验证

- [ ] 5.1 手动测试正常安装流程
  - 点击安装按钮，验证 loading 状态立即显示
  - 验证按钮被禁用，无法重复点击
  - 等待安装完成，验证成功 Toast 显示
  - 验证版本列表正确更新，显示"已安装"状态

- [ ] 5.2 手动测试服务运行时安装
  - 启动 Web 服务
  - 点击安装按钮，验证确认对话框显示
  - 点击"取消"，验证对话框关闭且状态重置
  - 再次点击安装，点击"确认"，验证服务停止并开始安装

- [ ] 5.3 手动测试重新安装流程
  - 在已安装版本列表中点击"重新安装"
  - 验证重新安装按钮显示 loading 状态
  - 验证其他操作按钮保持可用
  - 验证重新安装成功后显示成功 Toast

- [ ] 5.4 手动测试错误场景
  - 模拟网络错误（断开网络连接）
  - 尝试安装，验证错误 Toast 显示
  - 验证按钮恢复正常状态，可以重试

- [ ] 5.5 验证国际化
  - 切换到中文界面，验证所有文本为中文
  - 切换到英文界面，验证所有文本为英文
  - 验证 Toast 通知的语言切换正确

- [ ] 5.6 验证与其他异步操作的一致性
  - 对比依赖检查操作的 loading 样式
  - 对比服务启动操作的 Toast 通知样式
  - 确保安装操作的样式和交互与现有操作保持一致

## 6. 代码清理和优化

- [ ] 6.1 移除不必要的组件级状态
  - 检查 `VersionManagementPage.tsx` 中的 `installing` state
  - 如果已完全迁移到 Redux 状态管理，移除组件级 state

- [ ] 6.2 优化类型定义
  - 确保 `InstallState` 枚举被正确导出和使用
  - 添加必要的类型注释

- [ ] 6.3 代码审查
  - 检查代码风格与项目约定一致
  - 确保所有注释清晰准确
  - 验证没有引入新的 ESLint 或 TypeScript 错误

## 7. 文档更新

- [ ] 7.1 更新 OpenSpec 文档
  - 运行 `openspec validate install-button-loading-state-feedback --strict` 验证提案
  - 修复任何验证错误或警告

- [ ] 7.2 更新组件文档（如需要）
  - 如果项目有组件文档，更新 `VersionManagementPage` 的说明
  - 添加安装状态管理的相关说明

## 实施注意事项

1. **依赖关系**：任务应按顺序完成，状态管理扩展必须在 Saga 修改和 UI 更新之前完成。

2. **测试驱动**：每个阶段完成后应立即进行手动测试，确保功能正常。

3. **向后兼容**：确保不破坏现有的安装流程和用户数据。

4. **性能考虑**：避免频繁的 Redux 状态更新导致不必要的重新渲染。

5. **错误处理**：所有错误路径都应正确处理，确保状态不会卡在 loading 状态。
