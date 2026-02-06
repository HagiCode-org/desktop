## 1. Implementation

### 1.1 Redux Slice 状态更新优化
- [ ] 1.1.1 在 `webServiceSlice.ts` 中确保 `setOperating` action 立即更新状态
- [ ] 1.1.2 在 `webServiceSlice.ts` 中确保 `setStatus` action 支持过渡状态（starting/stopping）
- [ ] 1.1.3 验证状态转换逻辑的正确性

### 1.2 Redux Saga 异步处理优化
- [ ] 1.2.1 在 `startWebServiceSaga` 中，在发起 IPC 调用前先更新状态为 `starting`
- [ ] 1.2.2 在 `stopWebServiceSaga` 中，在发起 IPC 调用前先更新状态为 `stopping`
- [ ] 1.2.3 确保所有错误路径都正确重置 `isOperating` 状态
- [ ] 1.2.4 添加防抖机制防止快速连续点击（可选，视实际需求）

### 1.3 UI 组件即时反馈优化
- [ ] 1.3.1 更新 `HagicodeActionButton.tsx` 中的按钮禁用逻辑
- [ ] 1.3.2 确保启动按钮在 `isOperating = true` 时立即显示禁用状态
- [ ] 1.3.3 确保停止按钮在 `isOperating = true` 时立即显示禁用状态
- [ ] 1.3.4 验证加载动画在 `status = 'starting'` 时正确显示

### 1.4 WebServiceStatusCard 组件优化
- [ ] 1.4.1 更新 `WebServiceStatusCard.tsx` 中的 `isDisabled` 状态计算逻辑
- [ ] 1.4.2 确保 `isDisabled` 正确考虑 `isOperating` 和过渡状态
- [ ] 1.4.3 传递正确的 `status` prop 给 `HagicodeActionButton`

## 2. Testing

### 2.1 手动功能测试
- [ ] 2.1.1 测试点击启动按钮后立即显示加载状态
- [ ] 2.1.2 测试启动过程中按钮被正确禁用
- [ ] 2.1.3 测试快速连续点击启动按钮不会触发多次启动请求
- [ ] 2.1.4 测试启动失败后的错误处理和状态恢复
- [ ] 2.1.5 测试停止按钮的相同行为（对称性验证）

### 2.2 状态转换测试
- [ ] 2.2.1 验证 `stopped` -> `starting` -> `running` 状态转换
- [ ] 2.2.2 验证 `running` -> `stopping` -> `stopped` 状态转换
- [ ] 2.2.3 验证错误状态到恢复状态的转换
- [ ] 2.2.4 验证 `isOperating` 标志在所有路径中正确设置和重置

### 2.3 边界情况测试
- [ ] 2.3.1 测试启动过程中应用最小化/恢复时的 UI 状态
- [ ] 2.3.2 测试启动过程中切换语言/主题时的 UI 表现
- [ ] 2.3.3 测试启动过程中收到托盘命令时的行为
- [ ] 2.3.4 测试网络延迟高时的 UI 反馈表现

## 3. Documentation

### 3.1 国际化更新
- [ ] 3.1.1 确保所有加载状态的翻译文本已存在
- [ ] 3.1.2 添加缺失的翻译（如需要）

### 3.2 代码文档
- [ ] 3.2.1 更新相关组件的 JSDoc 注释
- [ ] 3.2.2 记录状态转换逻辑的设计决策

## 4. Verification

### 4.1 OpenSpec 验证
- [ ] 4.1.1 运行 `openspec validate web-service-start-button-immediate-feedback --strict`
- [ ] 4.1.2 修复所有验证问题

### 4.2 最终验收
- [ ] 4.2.1 所有任务标记为已完成
- [ ] 4.2.2 所有测试通过
- [ ] 4.2.3 代码审查通过
- [ ] 4.2.4 准备归档变更
