# Design: 依赖安装状态管理重构

## 概述
本文档说明移除 `DependencyInstallConfirmDialog` 后，依赖安装状态管理的重构设计。

## 当前架构问题

### 状态冗余
当前 `dependencySlice` 中存在两套重叠的状态管理：

1. **installConfirm** (待移除)
   - 用于显示独立弹窗
   - 包含待安装依赖列表
   - 包含版本 ID 和上下文

2. **installProgress** (保留)
   - 用于跟踪安装进度
   - 被 Onboarding 流程使用

3. **installCommandProgress** (待移除)
   - 用于命令执行进度对话框
   - 已被直接 IPC 调用（Install Command/Check Command）替代

### 数据流问题
```
VersionManagementPage
    → showInstallConfirm (action)
        → 更新 dependencySlice.installConfirm
            → installFromManifest (thunk)
                → 从 state.dependency.installConfirm 读取依赖列表
```

这种设计导致：
- 状态分散在两个 slice（`dependencySlice` 和 `onboardingSlice`）
- `installFromManifest` 依赖隐式的全局状态
- 难以测试和维护

## 新架构设计

### 状态管理分层

#### Onboarding 流程 (onboardingSlice)
负责首次使用引导期间的依赖管理：

```typescript
interface OnboardingState {
  // ... 其他状态

  // 依赖检查结果
  dependencyCheckResults: Array<{
    key: string;
    name: string;
    type: DependencyType;
    installed: boolean;
    version?: string;
    requiredVersion?: string;
    versionMismatch?: boolean;
    description?: string;
    isChecking?: boolean;
  }>;

  // 当前安装状态
  installingDependencies: boolean;
}
```

#### 依赖安装进度 (dependencySlice)
专注于安装进度跟踪：

```typescript
interface DependencyState {
  // ... 其他状态

  // 批量安装进度 (Onboarding 使用)
  installProgress: {
    installing: boolean;
    current: number;
    total: number;
    currentDependency: string;
    status: 'pending' | 'installing' | 'success' | 'error';
    errors: Array<{ dependency: string; error: string }>;
  };

  // 已移除: installCommandProgress
  // 不再使用进度对话框，直接通过 IPC 调用 installCommand 和 checkCommand
}
```

### 重构后的数据流

#### Onboarding 流程
```
DependencyInstaller 组件
    → 显示 dependencyCheckResults
    → 用户点击安装按钮
        → dispatch(installDependencies({
            versionId: string,
            dependencies: DependencyCheckResult[]
          }))
        → 更新 onboardingSlice.installingDependencies
        → 调用 IPC 安装
        → 更新 dependencySlice.installProgress
```

#### 版本管理页面
```
VersionManagementPage
    → 显示依赖列表
    → 用户点击单个依赖安装
        → 直接调用 IPC: window.electronAPI.installCommand()
        → 直接调用 IPC: window.electronAPI.checkCommand()
        → 不再使用进度对话框
        → 通过依赖状态刷新显示安装结果
```

### installFromManifest 重构

#### 当前实现 (问题)
```typescript
export const installFromManifest = createAsyncThunk(
  'dependency/installFromManifest',
  async (versionId: string, { dispatch, getState }) => {
    const state = getState() as any;
    const { dependencies, context } = state.dependency.installConfirm; // ❌ 依赖隐式状态
    // ...
  }
);
```

#### 重构方案 A：通过参数传递
```typescript
export const installFromManifest = createAsyncThunk(
  'dependency/installFromManifest',
  async (params: {
    versionId: string;
    dependencies: DependencyItem[];
    context?: 'version-management' | 'onboarding';
  }, { dispatch }) => {
    const { versionId, dependencies, context } = params; // ✅ 显式参数
    // ...
  }
);
```

#### 重构方案 B：从 onboardingSlice 获取
```typescript
export const installFromManifest = createAsyncThunk(
  'dependency/installFromManifest',
  async (versionId: string, { dispatch, getState }) => {
    const state = getState() as any;

    // 优先从 onboardingSlice 获取
    const onboardingDeps = state.onboarding.dependencyCheckResults;
    if (onboardingDeps && onboardingDeps.length > 0) {
      // 使用 Onboarding 的依赖列表
    }

    // 回退到通过 IPC 获取
    const missingDeps = await window.electronAPI.getMissingDependencies(versionId);
    // ...
  }
);
```

**推荐方案 A**：更明确、更易测试。

### 版本管理页面批量安装

#### 选项 A：循环调用单个依赖安装
```typescript
const handleInstallAllDependencies = async (versionId: string) => {
  const deps = dependencies[versionId];
  const needsInstall = deps.filter(dep => !dep.installed || dep.versionMismatch);

  for (const dep of needsInstall) {
    await dispatch(installSingleDependency({
      dependencyKey: dep.key,
      versionId: versionId,
    }));
  }
};
```

**优点**：
- 直接 IPC 调用，简单直接
- 每个依赖有独立的执行
- 错误隔离，一个失败不影响其他
- 无需维护复杂的进度对话框状态

**缺点**：
- 串行执行，速度较慢
- 无统一的进度显示

#### 选项 B：重构后的批量安装
```typescript
const handleInstallAllDependencies = async (versionId: string) => {
  const deps = dependencies[versionId];
  const needsInstall = deps.filter(dep => !dep.installed || dep.versionMismatch);

  dispatch(installFromManifest({
    versionId,
    dependencies: needsInstall,
    context: 'version-management',
  }));
};
```

**优点**：
- 批量执行，速度更快
- 统一的进度显示

**缺点**：
- 需要重构 `installFromManifest`

**推荐方案 A**：对于版本管理页面，单个依赖安装更符合"按需安装"的用户预期。批量安装主要用于 Onboarding 流程。

## 实施计划

### 步骤 1：重构 installFromManifest (采用方案 A)
- 修改 thunk 签名接受参数
- 更新 Onboarding 流程调用

### 步骤 2：更新版本管理页面
- 改用循环调用 `installSingleDependency`
- 移除 `showInstallConfirm` 相关代码

### 步骤 3：清理 dependencySlice
- 移除 `installConfirm` 状态
- 移除相关 actions 和 selectors

### 步骤 4：删除组件
- 删除 `DependencyInstallConfirmDialog.tsx`
- 删除 `DependencyInstallWarningBanner.tsx`
- 删除 `DependencyInstallProgressDialog.tsx`

### 步骤 5：清理 installCommandProgress 状态
- 从 `dependencySlice` 移除 `installCommandProgress` 状态
- 移除相关的 actions: `openInstallCommandDialog`, `closeInstallCommandDialog`, `addInstallCommandLog`, `updateInstallCommandProgress`, `setInstallCommandStatus`, `setInstallCommandVerification`
- 移除相关 selector: `selectInstallCommandProgress`
- 移除 `InstallCommandLog` 和 `InstallCommandProgress` 接口定义

## 兼容性考虑

### 老用户升级
已完成 Onboarding 的老用户：
- 不会看到 Onboarding 流程
- 可在版本管理页面管理依赖
- 使用单个依赖安装功能

### 新用户安装
首次安装的新用户：
- 进入 Onboarding 流程
- 通过 `DependencyInstaller` 组件完成依赖安装
- 不再看到独立的确认弹窗

## 测试策略

### 单元测试
- [ ] 测试重构后的 `installFromManifest` 接受参数
- [ ] 测试 `installSingleDependency` 的独立执行

### 集成测试
- [ ] 测试 Onboarding 流程的依赖安装
- [ ] 测试版本管理页面的单个依赖安装
- [ ] 测试版本管理页面的批量依赖安装（如采用选项 A）

### UI 测试
- [ ] 验证 `DependencyInstallConfirmDialog` 不再显示
- [ ] 验证 `DependencyInstallProgressDialog` 不再显示
- [ ] 验证依赖安装通过 IPC 直接调用成功
- [ ] 验证依赖状态正确更新
