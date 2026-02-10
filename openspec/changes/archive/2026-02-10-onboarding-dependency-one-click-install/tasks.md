# 实施任务清单

本文档详细列出"引导流程添加依赖一键安装"功能的实施任务。

## 任务概览

| 阶段 | 任务数 | 预计复杂度 |
|------|--------|------------|
| Phase 1: 状态管理精简 | 2 | 低 |
| Phase 2: 组件适配 | 2 | 中 |
| Phase 3: 引导流程集成 | 1 | 低 |
| Phase 4: 国际化调整 | 1 | 低 |
| Phase 5: 测试与验证 | 3 | 中 |
| **总计** | **9** | - |

> **注意**：由于采用直接组件复用策略，任务数量从原计划的 12 个减少到 9 个。

---

## Phase 1: 状态管理精简

### Task 1.1: 精简 onboardingSlice

**目标**: 移除 `onboardingSlice` 中冗余的依赖相关状态。

**描述**:
- 从 `onboardingSlice.ts` 中移除 `dependenciesStatus` 和 `isInstallingDependencies`
- 移除相关的 reducers 和 selectors
- 更新类型定义

**涉及文件**:
- `src/renderer/store/slices/onboardingSlice.ts`

**移除内容**:
```typescript
// 移除以下状态：
interface OnboardingState {
  // 移除: dependenciesStatus: DependencyItem[];
  // 移除: isInstallingDependencies: boolean;
  currentStep: number;
  versionId: string;
  // ... 其他非依赖相关状态
}

// 移除以下 selectors：
// - selectDependenciesStatus
// - selectIsInstallingDependencies
```

**验收标准**:
- [ ] 依赖相关状态已完全移除
- [ ] 现有测试通过（或已更新）
- [ ] TypeScript 编译无错误

---

### Task 1.2: 移除 onboarding 依赖相关 Thunks

**目标**: 移除 `onboardingThunks.ts` 中冗余的依赖管理 thunk。

**描述**:
- 移除 `checkDependencies` 和 `installDependencies` thunk
- 这些功能现在由 `dependencySaga` 提供
- 更新引用这些 thunk 的地方

**涉及文件**:
- `src/renderer/store/thunks/onboardingThunks.ts`
- `src/renderer/components/onboarding/steps/DependencyInstaller.tsx`

**移除内容**:
```typescript
// 移除以下 thunks：
// - checkDependencies (使用 dependencySaga 的 fetchDependenciesStatus)
// - installDependencies (使用 dependencySaga 的 installFromManifest)
```

**验收标准**:
- [ ] 冗余 thunks 已移除
- [ ] 无编译错误
- [ ] 引用已更新为使用 dependencySlice 的 actions

---

## Phase 2: 组件适配

### Task 2.1: 扩展 DependencyManagementCard 支持

**目标**: 为 `DependencyManagementCard` 添加支持引导流程的 props。

**描述**:
- 添加可选的 `context` prop 用于标识使用场景
- 添加 `onInstallComplete` 回调 prop
- 添加 `showAdvancedOptions` prop 用于控制 UI 简化
- 根据上下文调整组件行为

**涉及文件**:
- `src/renderer/components/DependencyManagementCard.tsx`

**实现细节**:
```typescript
interface DependencyManagementCardProps {
  // 现有 props
  versionId: string;

  // 新增 props
  context?: 'version-management' | 'onboarding';
  onInstallComplete?: () => void;
  showAdvancedOptions?: boolean;
}

// 组件内部根据 context 调整行为
const shouldShowAdvanced = showAdvancedOptions ?? context === 'version-management';
```

**验收标准**:
- [ ] 新 props 有合理的默认值
- [ ] 组件在两种上下文中都能正常工作
- [ ] 现有版本管理页面功能不受影响

---

### Task 2.2: 添加引导流程完成回调

**目标**: 在依赖安装完成后触发引导流程的后续步骤。

**描述**:
- 在 `dependencySaga` 中监听安装完成事件
- 调用 `onInstallComplete` 回调（如果提供）
- 确保只在引导流程上下文中触发

**涉及文件**:
- `src/renderer/store/sagas/dependencySaga.ts`

**实现细节**:
```typescript
// 在 installFromManifest saga 中
if (context === 'onboarding' && allDependenciesInstalled) {
  // 触发完成回调或发送 action
  yield put({ type: 'onboarding/dependencyInstallComplete' });
}
```

**验收标准**:
- [ ] 安装完成后正确触发回调
- [ ] 只在引导流程上下文中触发
- [ ] 不影响版本管理页面的行为

---

## Phase 3: 引导流程集成

### Task 3.1: 重构 DependencyInstaller 组件

**目标**: 让 `DependencyInstaller` 直接嵌入 `DependencyManagementCard`。

**描述**:
- 重写 `DependencyInstaller.tsx` 使用 `DependencyManagementCard`
- 从 `dependencySlice` 读取依赖状态
- 传递引导流程特有的 props
- 移除原有的依赖列表渲染逻辑

**涉及文件**:
- `src/renderer/components/onboarding/steps/DependencyInstaller.tsx`

**实现细节**:
```typescript
import { DependencyManagementCard } from '../../DependencyManagementCard';
import { useAppSelector } from '../../store/hooks';
import { goToNextStep } from '../../store/thunks/onboardingThunks';

export function DependencyInstaller() {
  const { versionId } = useAppSelector(state => state.onboarding);

  const handleInstallComplete = () => {
    // 自动进入下一步
    goToNextStep();
  };

  return (
    <div className="onboarding-dependency-container">
      <div className="onboarding-step-header">
        <h2>{t('dependencies.title')}</h2>
        <p className="text-muted-foreground">{t('dependencies.subtitle')}</p>
      </div>

      <DependencyManagementCard
        versionId={versionId}
        context="onboarding"
        onInstallComplete={handleInstallComplete}
        showAdvancedOptions={false}
      />
    </div>
  );
}
```

**验收标准**:
- [ ] 组件正确嵌入 `DependencyManagementCard`
- [ ] 依赖状态从 `dependencySlice` 正确读取
- [ ] 安装完成后自动进入下一步
- [ ] UI 显示符合引导流程风格

---

## Phase 4: 国际化调整

### Task 4.1: 更新引导流程国际化

**目标**: 添加引导流程特有的文案，复用 `components.json` 中的依赖管理翻译。

**描述**:
- 在 `onboarding.json` 中添加引导流程特有的标题和描述
- 复用 `components.json` 中的 `depInstallConfirm.*` 和 `dependencyManagement.*` 翻译

**涉及文件**:
- `src/renderer/i18n/locales/*/onboarding.json`

**需要添加的键**:
```json
{
  "dependencies": {
    "title": "Install System Dependencies",
    "subtitle": "Hagicode requires certain system dependencies to function properly.",
    "completeMessage": "All dependencies are installed. You can now proceed to the next step.",
    "retryButton": "Retry Installation",
    "skipButton": "Skip for Now"
  }
}
```

**注意**：以下翻译复用 `components.json`，无需重复添加：
- 一键安装按钮：使用 `depInstallConfirm.confirm`
- 进度显示：使用 `depInstallConfirm.installing`
- 错误信息：使用 `depInstallConfirm.errorsOccurred`

**验收标准**:
- [ ] 英文翻译已添加
- [ ] 中文翻译已添加
- [ ] 复用现有翻译键，避免重复

---

## Phase 5: 测试与验证

### Task 5.1: 单元测试

**目标**: 为修改的组件和状态管理编写测试。

**描述**:
- 测试 `DependencyManagementCard` 的新 props
- 测试 `onboardingSlice` 精简后的状态
- 测试回调机制

**涉及文件**:
- `src/renderer/components/DependencyManagementCard.test.tsx`
- `src/renderer/store/slices/onboardingSlice.test.ts`

**测试覆盖**:
- [ ] `context` prop 的不同值
- [ ] `onInstallComplete` 回调触发
- [ ] `showAdvancedOptions` 的显示控制
- [ ] onboardingSlice 状态读取

**验收标准**:
- [ ] 测试覆盖率 > 80%
- [ ] 所有测试通过
- [ ] 现有测试不受影响

---

### Task 5.2: 集成测试

**目标**: 测试引导流程的完整依赖安装流程。

**描述**:
- 测试从进入依赖步骤到安装完成的全流程
- 测试与版本管理页面使用相同的状态源
- 测试自动导航到下一步

**涉及文件**:
- `src/renderer/components/onboarding/steps/DependencyInstaller.test.tsx`

**测试场景**:
- [ ] 正常安装流程（所有依赖成功）
- [ ] 部分依赖失败
- [ ] 用户跳过安装步骤
- [ ] 安装完成后自动进入下一步

**验收标准**:
- [ ] 所有场景测试通过
- [ ] 与 dependencySlice 的交互正确
- [ ] 导航逻辑正常

---

### Task 5.3: 手动验证

**目标**: 在真实环境中验证功能。

**描述**:
- 在不同平台上测试功能
- 验证引导流程与版本管理页面的一致性
- 测试国际化切换

**测试清单**:
- [ ] Windows 平台测试
- [ ] macOS 平台测试
- [ ] Linux 平台测试
- [ ] 中英文切换测试
- [ ] 完整引导流程测试
- [ ] 验证版本管理页面功能不受影响

**验收标准**:
- [ ] 所有平台功能正常
- [ ] 引导流程与版本管理页面 UI 一致
- [ ] 语言切换无错误
- [ ] 无控制台错误或警告

---

## 任务依赖关系

```
Phase 1: 状态管理精简
├── Task 1.1 ─┐
└── Task 1.2 ─┼─> Phase 2: 组件适配
               ├── Task 2.1 ─┐
               └── Task 2.2 ─┼─> Phase 3: 引导流程集成
                                 └── Task 3.1 ─┬─> Phase 4: 国际化调整
                                              └── Task 4.1 ─┬─> Phase 5: 测试与验证
                                                               ├── Task 5.1 ─┐
                                                               ├── Task 5.2 ─┼─> 完成
                                                               └── Task 5.3 ──┘
```

## 实施注意事项

1. **向后兼容**: 确保 `DependencyManagementCard` 的修改不影响版本管理页面
2. **默认值安全**: 新 props 应该有合理的默认值，确保现有调用不受影响
3. **单一数据源**: 严格遵循从 `dependencySlice` 读取依赖状态的原则
4. **测试覆盖**: 修改的组件需要补充测试用例
5. **渐进式实施**: 可以先完成组件适配，再进行引导流程集成

## 完成标准

整个功能实施完成后，应该满足以下标准：

- [ ] 引导流程直接使用 `DependencyManagementCard` 组件
- [ ] 依赖状态统一从 `dependencySlice` 读取，无冗余状态
- [ ] 新用户可以在引导流程中一键安装所有依赖
- [ ] 安装完成后自动进入引导流程的下一步
- [ ] 引导流程与版本管理页面使用相同的依赖管理逻辑
- [ ] 版本管理页面功能不受任何影响
- [ ] 所有测试通过，测试覆盖率达标
- [ ] 支持中英文双语
- [ ] 在所有平台上正常工作

## 架构改进收益

采用直接组件复用策略后的收益：

1. **代码减少**: 约 40% 的计划代码量减少（从 12 个任务减少到 9 个）
2. **维护成本**: 单一数据源，无需维护两套状态同步逻辑
3. **一致性保证**: UI/UX 完全一致，无差异体验
4. **bug 风险**: 使用已验证的组件，降低引入新 bug 的风险
5. **未来扩展**: 依赖管理功能的改进自动惠及两个页面
