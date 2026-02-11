# 引导流程依赖检查结果详细展示 - 实施任务

## 1. 状态管理扩展

- [ ] 1.1 在 `src/renderer/store/slices/onboardingSlice.ts` 中添加 `dependencyCheckResults` 状态字段
- [ ] 1.2 更新 `OnboardingState` 接口类型定义
- [ ] 1.3 添加 `setDependencyCheckResults` reducer action
- [ ] 1.4 添加对应的 selector 用于获取依赖检查结果

## 2. 国际化支持

- [ ] 2.1 在 `src/renderer/i18n/locales/en-US/onboarding.json` 中添加依赖检查相关翻译
  - [ ] 2.1.1 添加 `dependencyCheck.title`
  - [ ] 2.1.2 添加 `dependencyCheck.summary`
  - [ ] 2.1.3 添加 `dependencyCheck.status.*`
  - [ ] 2.1.4 添加 `dependencyCheck.details.*`
- [ ] 2.2 在 `src/renderer/i18n/locales/zh-CN/onboarding.json` 中添加对应的中文翻译
- [ ] 2.3 在 `src/renderer/i18n/locales/en-US/components.json` 中复用或添加依赖项相关的翻译（如需要）
- [ ] 2.4 在 `src/renderer/i18n/locales/zh-CN/components.json` 中添加对应的中文翻译（如需要）

## 3. 引导步骤组件增强

- [ ] 3.1 更新 `src/renderer/components/onboarding/steps/DependencyInstaller.tsx`
  - [ ] 3.1.1 添加依赖检查结果的汇总显示区域
  - [ ] 3.1.2 实现依赖项详细列表的渲染
  - [ ] 3.1.3 添加状态图标（✓ 已安装、⚠ 版本不匹配、✗ 未安装）
  - [ ] 3.1.4 添加版本信息显示（当前版本/所需版本）
- [ ] 3.2 实现折叠/展开交互功能
  - [ ] 3.2.1 添加状态管理（展开/收起）
  - [ ] 3.2.2 添加展开/收起按钮
  - [ ] 3.2.3 实现平滑的展开/收起动画
- [ ] 3.3 添加依赖项描述信息的展示
- [ ] 3.4 确保与现有的 `DependencyManagementCardUnified` 组件协同工作

## 4. 数据流集成

- [ ] 4.1 确保依赖检查结果正确存储到 Redux 状态中
- [ ] 4.2 验证 IPC 通信正常工作（使用现有的依赖检查通道）
- [ ] 4.3 确保组件正确订阅状态变化

## 5. 样式和响应式设计

- [ ] 5.1 确保依赖检查结果卡片符合 shadcn/ui 设计规范
- [ ] 5.2 优化不同屏幕尺寸下的显示效果
- [ ] 5.3 确保颜色状态（成功/警告/错误）符合无障碍标准

## 6. 测试和验证

- [ ] 6.1 手动测试：无依赖缺失时的显示
- [ ] 6.2 手动测试：有依赖缺失时的显示
- [ ] 6.3 手动测试：有版本不匹配时的显示
- [ ] 6.4 验证折叠/展开功能正常工作
- [ ] 6.5 验证国际化切换正确显示
- [ ] 6.6 验证引导流程可以正常进行到下一步

## 7. 规范更新

- [ ] 7.1 在 `openspec/changes/onboarding-dependency-check-detailed-display/specs/dependency-management/spec.md` 中添加新的需求场景
- [ ] 7.2 运行 `openspec validate onboarding-dependency-check-detailed-display --strict` 验证提案格式
