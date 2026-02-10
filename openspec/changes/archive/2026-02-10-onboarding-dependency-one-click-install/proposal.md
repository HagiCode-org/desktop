# 引导流程添加依赖一键安装

**Change ID:** `onboarding-dependency-one-click-install`
**Status:** ExecutionCompleted
**Created:** 2026-02-10

---

## 概述

为首次使用引导（Onboarding）流程添加依赖项一键安装功能，统一引导流程与版本管理页面的依赖管理体验。

## 背景与问题

### 当前状态

Hagicode Desktop 包含两个依赖管理入口：

1. **引导流程依赖管理** (`DependencyInstaller.tsx`)
   - 基础的依赖检查和安装界面
   - 单个"Install Dependencies"按钮批量安装
   - 简单的进度显示

2. **版本管理页面依赖管理** (`DependencyManagementCard.tsx` + `DependencyInstallConfirmDialog.tsx`)
   - 完整的依赖管理功能
   - 逐个依赖项状态显示
   - 一键安装所有缺失依赖
   - 详细的进度跟踪和错误处理
   - 支持手动安装链接

### 存在的问题

1. **用户体验不一致**：同一功能在不同页面呈现不同的交互模式
2. **功能割裂**：引导流程缺少版本管理页面已有的完善功能
3. **代码重复**：依赖管理逻辑分散在两处，维护成本高
4. **操作效率低**：新用户无法在引导流程中快速完成依赖安装

## 解决方案

### 核心策略

采用**直接组件复用**策略，让引导流程直接使用版本管理页面的依赖管理组件。

**关键原则**：
- 引导流程的依赖管理步骤直接嵌入 `DependencyManagementCard` 组件
- 共享相同的 Redux 状态 (`dependencySlice`) 和 Saga 逻辑
- 确保两处使用完全相同的管理和维护逻辑
- 仅针对引导流程的特殊需求做最小化适配

这种策略的优势：
1. **单一数据源**：依赖状态只存在于 `dependencySlice` 中，避免状态同步问题
2. **统一维护**：依赖管理功能的改进自动惠及两个页面
3. **一致性保证**：UI/UX 完全一致，用户体验无差异
4. **代码精简**：大幅减少重复代码

### 实现范围

#### 1. 直接组件复用

引导流程直接嵌入以下组件：

| 组件/模块 | 复用方式 | 说明 |
|-----------|---------|------|
| `DependencyManagementCard` | 直接嵌入 | 作为引导流程依赖管理步骤的主要内容 |
| `DependencyInstallConfirmDialog` | 直接复用 | 批量安装确认对话框 |
| `dependencySlice` | 直接复用 | 使用相同的依赖状态管理 |
| `dependencySaga` | 直接复用 | 使用相同的异步操作和进度跟踪 |

#### 2. 架构调整

**当前状态**：
```
引导流程 ──> onboardingSlice ──> 独立的依赖管理逻辑
版本管理 ──> dependencySlice ──> 完善的依赖管理逻辑
```

**目标状态**：
```
引导流程 ──┐
           ├──> dependencySlice ──> dependencySaga ──> 统一的依赖管理逻辑
版本管理 ──┘
```

#### 3. 功能适配

引导流程需要的特殊适配：

- **上下文适配**：传递引导流程特有的版本 ID 和上下文信息
- **导航控制**：依赖安装完成后自动进入下一步骤
- **简化 UI**：引导流程中可能需要隐藏部分高级选项（如"访问官方网站"）

## 技术实现

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│              引导流程与版本管理的统一架构                    │
└─────────────────────────────────────────────────────────────┘

┌───────────────────────────┐     ┌───────────────────────────┐
│   Onboarding Flow         │     │   Version Management      │
│   (引导流程)               │     │   (版本管理页面)           │
├───────────────────────────┤     ├───────────────────────────┤
│ DependencyInstaller.tsx   │     │ VersionManagementPage.tsx │
│   │                       │     │   │                       │
│   └── Embedded ───────────┼─────┼──> DependencyManagement  │
│      DependencyCard       │     │      Card.tsx             │
└───────────────────────────┘     └───────────────────────────┘
            │                                 │
            └─────────────┬───────────────────┘
                         ▼
        ┌─────────────────────────────────────────────┐
        │         Shared Redux State (dependencySlice) │
        │  ┌───────────────────────────────────────┐  │
        │  │  dependencies: DependencyItem[]       │  │
        │  │  installConfirm: { show, deps, id }   │  │
        │  │  installProgress: { current, total }  │  │
        │  └───────────────────────────────────────┘  │
        └─────────────────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────────────────┐
        │      Shared Saga (dependencySaga)           │
        │  ┌───────────────────────────────────────┐  │
        │  │  installFromManifest                  │  │
        │  │  Progress tracking via event channels │  │
        │  │  Error handling & toast notifications │  │
        │  └───────────────────────────────────────┘  │
        └─────────────────────────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────────────────┐
        │     Main Process (dependency-manager.ts)    │
        │  ┌───────────────────────────────────────┐  │
        │  │  checkAllDependencies()               │  │
        │  │  installFromManifest()                │  │
        │  │  Progress events via IPC              │  │
        │  └───────────────────────────────────────┘  │
        └─────────────────────────────────────────────┘
```

### 关键实现点

#### 1. DependencyInstaller 组件重构

```typescript
// DependencyInstaller.tsx - 重构后的结构
import { DependencyManagementCard } from '../../DependencyManagementCard';
import { useAppSelector } from '../../store/hooks';

export function DependencyInstaller() {
  const { versionId } = useAppSelector(state => state.onboarding);

  // 引导流程特有的回调：安装完成后自动进入下一步
  const handleInstallComplete = () => {
    // 触发引导流程的下一步导航
  };

  return (
    <div className="onboarding-dependency-step">
      <div className="step-header">
        <h2>{t('dependencies.title')}</h2>
        <p>{t('dependencies.description')}</p>
      </div>

      {/* 直接嵌入 DependencyManagementCard，传递引导流程上下文 */}
      <DependencyManagementCard
        versionId={versionId}
        context="onboarding"
        onInstallComplete={handleInstallComplete}
        showAdvancedOptions={false}  // 简化 UI，隐藏高级选项
      />
    </div>
  );
}
```

#### 2. DependencyManagementCard 适配

对现有组件进行最小化修改以支持引导流程：

```typescript
// 新增 props
interface DependencyManagementCardProps {
  versionId: string;
  context?: 'version-management' | 'onboarding';  // 上下文标识
  onInstallComplete?: () => void;  // 引导流程回调
  showAdvancedOptions?: boolean;  // 是否显示高级选项
}
```

#### 3. 状态管理统一

- **废弃**: `onboardingSlice` 中的依赖相关状态 (`dependenciesStatus`, `isInstallingDependencies`)
- **使用**: 直接从 `dependencySlice` 读取所有依赖状态
- **好处**: 消除状态同步问题，单一数据源

### 状态管理

**统一使用 dependencySlice**：

```typescript
// dependencySlice.ts (统一状态源)
interface DependencyState {
  dependencies: DependencyItem[];          // 所有依赖项状态
  loading: boolean;                         // 加载状态
  installing: boolean;                      // 安装进行中
  installConfirm: {
    show: boolean;
    dependencies: DependencyItem[];
    versionId: string;
  };
  installProgress: {
    installing: boolean;
    current: number;
    total: number;
    currentDependency: string;
    errors: Array<{ dependency: string; error: string }>;
  };
}

// onboardingSlice.ts (简化后，移除依赖相关状态)
interface OnboardingState {
  currentStep: number;
  versionId: string;
  // 移除: dependenciesStatus, isInstallingDependencies
  // 这些状态现在从 dependencySlice 读取
}
```

### IPC 通信

完全复用现有的 IPC 接口，无需新增：

| 方法 | 用途 | 原有调用者 |
|------|------|-----------|
| `checkDependencies()` | 检查依赖状态 | 版本管理页面 |
| `installFromManifest(versionId)` | 批量安装依赖 | 版本管理页面 |
| `onDependencyInstallProgress` | 监听安装进度 | 版本管理页面 |

**优势**：引导流程和版本管理页面使用完全相同的后端接口。

### 国际化支持

在现有翻译文件基础上添加/更新：

**`onboarding.json`** (英文/中文)：
- `dependencies.oneClickInstall`: 一键安装按钮文本
- `dependencies.confirmDialog.title`: 确认对话框标题
- `dependencies.confirmDialog.description`: 确认对话框描述
- `dependencies.progress.installing`: 安装进行中文本

**复用 `components.json` 中的现有翻译**：
- `depInstallConfirm.*` - 确认对话框相关
- `dependencyManagement.*` - 依赖管理相关

## 实施计划

详细的实施任务清单请参阅 [tasks.md](./tasks.md)。

## 影响评估

### 用户体验改善

- **减少操作步骤**：用户可以在引导流程中一次性完成所有依赖安装
- **统一体验**：引导流程与版本管理页面使用相同的交互模式
- **更好的反馈**：实时进度显示和错误提示

### 技术影响

**正面影响**：
- **代码复用最大化**：引导流程直接使用现有组件，几乎不需要新增代码
- **统一维护**：依赖管理功能的改进自动惠及两个页面
- **消除状态同步问题**：单一数据源，不存在状态不一致
- **降低 bug 风险**：使用已验证的组件和逻辑

**潜在风险**：
- `DependencyManagementCard` 需要适配引导流程的特殊需求
- 需要确保组件复用不会影响版本管理页面的现有功能
- 可能需要重构 `onboardingSlice` 以移除冗余的依赖状态

### 兼容性

- 保持与现有 IPC 接口的兼容性
- 确保不影响版本管理页面的现有功能
- 支持所有平台（Windows、macOS、Linux）

## 成功标准

1. **功能完整性**：引导流程中能够一键安装所有缺失依赖
2. **用户体验**：安装过程有清晰的进度反馈和错误提示
3. **代码质量**：复用现有组件，不增加代码重复
4. **测试覆盖**：所有新增和修改的代码都有对应测试
5. **国际化**：支持中英文双语

## 相关文件

### 需要修改的文件

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/renderer/components/onboarding/steps/DependencyInstaller.tsx` | 重构 | 直接嵌入 `DependencyManagementCard` |
| `src/renderer/components/DependencyManagementCard.tsx` | 适配 | 添加 `context`、`onInstallComplete` 等 props |
| `src/renderer/store/slices/onboardingSlice.ts` | 精简 | 移除冗余的依赖相关状态 |
| `src/renderer/store/thunks/onboardingThunks.ts` | 精简 | 移除依赖相关的 thunk |

### 需要复用的组件（无需修改）

| 组件 | 用途 |
|------|------|
| `DependencyInstallConfirmDialog.tsx` | 批量安装确认对话框 |
| `dependencySaga.ts` | 异步操作和进度跟踪 |
| `dependencySlice.ts` | 统一的依赖状态管理 |

### 后端文件（无需修改）

- `src/main/dependency-manager.ts`
- 相关 IPC 处理程序

## 参考资料

- [OpenSpec 规范文档](../../specs/openspec-spec.md)
- [项目架构文档](../../docs/architecture.md)
- [组件设计指南](../../docs/component-guidelines.md)
