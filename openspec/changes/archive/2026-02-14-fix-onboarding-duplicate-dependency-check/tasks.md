# Tasks: 修复首次引导流程中的重复依赖检查

## Overview

通过修改 `DependencyInstaller` 组件的挂载行为，消除首次使用引导流程中依赖检查重复执行的问题。

---

## Task 1: 分析和验证当前问题

**Priority:** High
**Estimated Complexity:** Medium

### Description

在修改代码之前，通过日志分析和实际操作验证重复检查确实存在，并确定确切的触发时机。

### Implementation Steps

1. 启动应用并触发首次使用引导流程
2. 打开开发者工具，观察 Console 日志
3. 记录以下事件顺序：
   - `downloadPackage fulfilled`
   - `checkDependenciesAfterInstall` 调用
   - `goToNextStep` action
   - 第二次 `checkDependenciesAfterInstall` 调用
4. 确认两次检查都发生在相同的 versionId 上

### 验证当前行为的关键日志

```
[OnboardingWizard] Download complete, version stored: [versionId]
[DependencyInstaller] Download complete, triggering initial dependency check for version: [versionId]
[checkDependenciesAfterInstall] Starting with versionId: [versionId], context: onboarding
[OnboardingWizard] handleNext called, current step: 1
[DependencyInstaller] Download complete, triggering initial dependency check for version: [versionId]  <-- 重复调用
[checkDependenciesAfterInstall] Starting with versionId: [versionId], context: onboarding  <-- 重复调用
```

### Acceptance Criteria

- [ ] 确认重复检查确实存在
- [ ] 记录了完整的日志序列
- [ ] 确认两次检查的触发点

---

## Task 2: 修改 DependencyInstaller 组件

**Priority:** High
**Estimated Complexity:** Low

### Description

修改 `src/renderer/components/onboarding/steps/DependencyInstaller.tsx`，移除或条件化组件挂载时的自动依赖检查。

### Implementation Steps

1. 打开 `src/renderer/components/onboarding/steps/DependencyInstaller.tsx`
2. 定位到第 58-64 行的 useEffect：
   ```typescript
   useEffect(() => {
     if (downloadProgress?.version && dependencyCheckResults.length === 0) {
       console.log('[DependencyInstaller] Download complete, triggering initial dependency check for version:', downloadProgress.version);
       dispatch(checkDependenciesAfterInstall({ versionId: downloadProgress.version, context: 'onboarding' }));
     }
   }, [downloadProgress?.version, dispatch]);
   ```
3. 选择以下方案之一：

   **方案 A（推荐）**：完全移除该 useEffect
   - 删除整个 useEffect 块（第 58-64 行）
   - 依赖用户在依赖安装步骤中的其他交互触发检查
   - 或者添加手动"检查依赖"按钮

   **方案 B**：添加 currentStep 依赖条件
   ```typescript
   useEffect(() => {
     if (downloadProgress?.version && dependencyCheckResults.length === 0 && currentStep === OnboardingStep.Dependencies) {
       console.log('[DependencyInstaller] Dependencies step mounted, triggering dependency check for version:', downloadProgress.version);
       dispatch(checkDependenciesAfterInstall({ versionId: downloadProgress.version, context: 'onboarding' }));
     }
   }, [downloadProgress?.version, dispatch, currentStep]);
   ```

4. 如果选择方案 B，需要：
   - 导入 `OnboardingStep` 枚举（如果尚未导入）
   - 从 Redux state 中获取 `currentStep`（如果尚未获取）

### Code Changes

**文件**: `src/renderer/components/onboarding/steps/DependencyInstaller.tsx`

**变更类型**: 修改

| 行号 | 变更前 | 变更后 | 变更原因 |
|-----|--------|--------|---------|
| 58-64 | useEffect 在组件挂载时检查依赖 | 移除或添加 currentStep 条件 | 消除下载阶段的重复检查 |

### Acceptance Criteria

- [ ] useEffect 已移除或正确条件化
- [ ] 如果选择方案 B，正确导入了 OnboardingStep 和 currentStep
- [ ] 代码通过 TypeScript 类型检查
- [ ] 无 lint 错误

---

## Task 3: 验证步骤转换逻辑

**Priority:** High
**Estimated Complexity:** Medium

### Description

确认下载步骤完成后，用户点击"下一步"能正确转换到依赖安装步骤。

### Test Cases

1. **正常流程：下载 → 依赖安装**
   - 完成软件包下载（进度 100%）
   - 点击"下一步"按钮
   - 验证：步骤转换为 Dependencies
   - 验证：触发一次依赖检查
   - 验证：检查结果正确显示

2. **边界情况：快速点击**
   - 下载进度接近完成时点击"下一步"
   - 验证：不应触发检查或等待下载完成
   - 验证：UI 状态正确

3. **返回和前进**
   - 从依赖安装步骤返回下载步骤
   - 再次前进到依赖安装步骤
   - 验证：不会重复检查（已有结果时）

### Acceptance Criteria

- [ ] 步骤转换逻辑正常工作
- [ ] 依赖检查仅在正确时机触发
- [ ] UI 状态转换流畅

---

## Task 4: 端到端测试首次引导流程

**Priority:** High
**Estimated Complexity:** Medium

### Description

完整测试首次使用引导流程，确保修复后整个流程正常工作且重复检查已消除。

### Test Scenarios

#### 场景 1：全新用户首次启动

1. 清空应用数据和存储（或使用新环境）
2. 启动应用
3. 完成欢迎步骤（点击"开始使用"）
4. 等待下载完成（进度 100%）
5. 观察并记录：
   - 是否在下载步骤触发了依赖检查？（应该：否）
   - Console 日志中 `checkDependenciesAfterInstall` 调用次数
6. 点击"下一步"进入依赖安装步骤
7. 观察并记录：
   - 是否触发了依赖检查？（应该：是）
   - Console 日志中 `checkDependenciesAfterInstall` 调用次数
8. 验证总调用次数为 1

#### 场景 2：依赖安装完成后继续

1. 继续场景 1
2. 安装所有缺失依赖（或跳过）
3. 点击"下一步"进入服务启动步骤
4. 验证：步骤转换正常
5. 完成服务启动
6. 验证：引导流程完成

#### 场景 3：步骤导航

1. 在依赖安装步骤
2. 点击"上一步"返回下载步骤
3. 再次点击"下一步"进入依赖安装步骤
4. 验证：
   - 不重新触发依赖检查（已有结果）
   - UI 显示之前的检查结果

### Acceptance Criteria

- [ ] 场景 1：依赖检查仅执行 1 次
- [ ] 场景 2：完整流程可正常完成
- [ ] 场景 3：步骤导航不触发重复检查
- [ ] 所有步骤 UI 状态正确
- [ ] 无错误日志或异常

---

## Task 5: 验证其他流程不受影响

**Priority:** Medium
**Estimated Complexity:** Medium

### Description

确保修改不影响版本管理中的依赖检查功能。

### Test Cases

1. **版本管理 → 依赖检查**
   - 打开版本管理页面
   - 选择一个已安装版本
   - 点击"检查依赖"或类似操作
   - 验证：依赖检查正常工作
   - 验证：检查结果正确显示

2. **版本安装后的依赖检查**
   - 安装新版本
   - 系统自动检查依赖
   - 验证：检查结果正确

3. **Context 参数验证**
   - 检查日志中的 `context` 参数
   - 验证：onboarding 流程使用 `context: 'onboarding'`
   - 验证：版本管理使用 `context: 'version-management'`

### Acceptance Criteria

- [ ] 版本管理中的依赖检查正常工作
- [ ] context 参数正确区分不同场景
- [ ] 无功能回归

---

## Task 6: 性能和日志验证

**Priority:** Medium
**Estimated Complexity:** Low

### Description

通过日志分析和性能指标验证修复效果。

### Verification Steps

1. **IPC 调用次数对比**
   - 修复前：记录完整的引导流程中 `getMissingDependencies` 和 `getAllDependencies` 调用次数
   - 修复后：记录相同流程中的调用次数
   - 验证：调用次数减少

2. **Console 日志分析**
   - 搜索 `checkDependenciesAfterInstall` 关键字
   - 验证：在整个引导流程中仅出现 1 次
   - 验证：出现时机在用户进入依赖安装步骤后

3. **用户体验时间**
   - 计时：从下载完成到可以安装依赖的时间
   - 修复前 vs 修复后对比
   - 验证：修复后时间缩短（消除重复检查）

### Acceptance Criteria

- [ ] IPC 调用次数减少
- [ ] Console 日志显示 1 次依赖检查
- [ ] 用户体验时间有所改善

---

## Task 7: 代码审查和文档更新

**Priority:** Low
**Estimated Complexity:** Low

### Description

审查代码变更，更新相关注释和文档。

### Implementation Steps

1. **代码注释**
   - 在 `DependencyInstaller.tsx` 中添加注释说明检查触发逻辑
   - 解释为什么移除或条件化了挂载时的检查
   - 示例：
     ```typescript
     // Note: Dependency check is triggered when user enters this step,
     // not on component mount, to avoid duplicate checks after download.
     ```

2. **组件文档**
   - 如果项目有组件文档，更新 `DependencyInstaller` 的说明
   - 注明依赖检查的触发时机

3. **技术债务记录**
   - 检查是否有其他类似的挂载时检查行为
   - 如有需要，记录为技术债务

### Acceptance Criteria

- [ ] 代码注释清晰说明变更原因
- [ ] 相关文档已更新（如适用）
- [ ] 代码审查无其他问题

---

## Task 8: 回归测试清单

**Priority:** High
**Estimated Complexity:** Medium

### Description

执行完整的回归测试清单，确保无功能破坏。

### Test Checklist

#### 首次使用引导流程
- [ ] 欢迎 → 下载：步骤转换正常
- [ ] 下载进度显示正确
- [ ] 下载完成状态正确
- [ ] 下载 → 依赖：步骤转换正常
- [ ] 依赖检查触发 1 次
- [ ] 依赖列表显示正确
- [ ] 依赖安装功能正常
- [ ] 依赖 → 启动：步骤转换正常
- [ ] 服务启动功能正常
- [ ] 引导流程完成正常

#### 版本管理
- [ ] 版本列表显示正常
- [ ] 安装新版本功能正常
- [ ] 卸载版本功能正常
- [ ] 切换版本功能正常
- [ ] 依赖检查功能正常（版本管理场景）
- [ ] 依赖安装功能正常（版本管理场景）

#### 步骤导航
- [ ] "上一步"按钮在所有步骤正常工作
- [ ] "下一步"按钮启用/禁用状态正确
- [ ] 跳过引导流程功能正常
- [ ] 返回并重新进入步骤不丢失数据

#### 错误处理
- [ ] 下载失败显示错误
- [ ] 依赖检查失败显示错误
- [ ] 依赖安装失败显示错误
- [ ] 服务启动失败显示错误

### Acceptance Criteria

- [ ] 所有回归测试用例通过
- [ ] 无新的 bug 引入
- [ ] 用户体验符合预期
