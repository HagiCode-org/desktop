# Tasks: 移除冗余依赖安装弹窗组件

## Overview
本任务清单用于移除 Hagicode Desktop 应用中冗余的依赖安装弹窗组件，统一依赖安装流程到 Onboarding 流程中。

## Phase 1: 代码分析与验证 (必须首先完成)

### 1.1 确认组件引用关系
- [ ] 搜索 `DependencyInstallConfirmDialog` 的所有引用
- [ ] 搜索 `DependencyInstallWarningBanner` 的所有引用
- [ ] 搜索 `DependencyInstallProgressDialog` 的所有引用
- [ ] 确认是否只有 `App.tsx` 引用了 `DependencyInstallConfirmDialog`
- [ ] 确认 `DependencyInstallWarningBanner` 是否有其他引用
- [ ] 确认 `DependencyInstallProgressDialog` 在哪些组件中使用（如 `DependencyCheckCard`, `DependencyManagementCard`）

**验证点**：确认可以安全删除这些组件，以及需要更新的其他组件

### 1.2 分析 Redux 状态依赖
- [ ] 检查 `dependencySlice.ts` 中 `installConfirm` 状态的使用情况
- [ ] 检查 `showInstallConfirm` 和 `hideInstallConfirm` actions 的调用者
- [ ] 检查 `installCommandProgress` 状态的使用情况
- [ ] 检查相关 actions: `openInstallCommandDialog`, `closeInstallCommandDialog`, `addInstallCommandLog` 等的调用者
- [ ] 确认 `installProgress` 状态仍被 Onboarding 流程使用（需保留）

**验证点**：明确哪些状态需要删除，哪些需要保留

### 1.3 确认版本管理页面行为
- [ ] 分析 `VersionManagementPage.tsx` 中 `handleInstallAllDependencies` 的实现
- [ ] 确定移除弹窗后的依赖安装方式：
  - 选项 A：循环调用 `installSingleDependency`
  - 选项 B：重构 `installFromManifest` 以接受参数而非依赖 state
- [ ] 决定最终实施方案

**验证点**：确定版本管理页面依赖安装功能的实现方式

## Phase 2: 组件删除 (核心变更)

### 2.1 删除弹窗组件文件
- [ ] 删除 `src/renderer/components/DependencyInstallConfirmDialog.tsx`
- [ ] 删除 `src/renderer/components/DependencyInstallWarningBanner.tsx`（如确认无其他引用）
- [ ] 删除 `src/renderer/components/DependencyInstallProgressDialog.tsx`（如确认无其他引用）
- [ ] 验证删除后项目可以正常构建

**文件**：
- `src/renderer/components/DependencyInstallConfirmDialog.tsx`
- `src/renderer/components/DependencyInstallWarningBanner.tsx`
- `src/renderer/components/DependencyInstallProgressDialog.tsx`

### 2.2 清理 App.tsx 引用
- [ ] 从 `src/renderer/App.tsx` 移除 `DependencyInstallConfirmDialog` 导入
- [ ] 从 `src/renderer/App.tsx` 移除 `DependencyInstallProgressDialog` 导入
- [ ] 从 `src/renderer/App.tsx` 移除 `<DependencyInstallConfirmDialog />` 组件渲染
- [ ] 从 `src/renderer/App.tsx` 移除 `<DependencyInstallProgressDialog />` 组件渲染

**修改文件**：`src/renderer/App.tsx`

## Phase 3: 状态管理清理

### 3.1 清理 dependencySlice
- [ ] 从 `DependencyState` 接口移除 `installConfirm` 字段
- [ ] 从 `initialState` 移除 `installConfirm` 初始值
- [ ] 移除 `showInstallConfirm` reducer action
- [ ] 移除 `hideInstallConfirm` reducer action
- [ ] 移除 `selectShowInstallConfirm` selector
- [ ] 移除 `selectPendingDependencies` selector
- [ ] 移除 `selectInstallConfirmVersionId` selector
- [ ] 移除 `selectInstallConfirmContext` selector
- [ ] 从导出的 actions 中移除 `showInstallConfirm` 和 `hideInstallConfirm`

**修改文件**：`src/renderer/store/slices/dependencySlice.ts`

**保留**（这些仍被 Onboarding 使用）：
- `installProgress` 状态
- 相关 actions: `startInstall`, `updateInstallProgress`, `completeInstall`

**移除**（不再使用命令进度对话框）：
- `installCommandProgress` 状态定义
- `openInstallCommandDialog` action
- `closeInstallCommandDialog` action
- `addInstallCommandLog` action
- `updateInstallCommandProgress` action
- `setInstallCommandStatus` action
- `setInstallCommandVerification` action
- `selectInstallCommandProgress` selector
- `InstallCommandLog` 接口
- `InstallCommandProgress` 接口

### 3.2 清理 dependencyThunks
- [ ] 修改 `installFromManifest` thunk：
  - 不再从 `state.dependency.installConfirm` 获取依赖列表
  - 改为从 `onboardingSlice` 或参数传递获取
- [ ] 清理 `checkDependenciesAfterInstall` 中注释的弹窗代码
- [ ] 移除 `showInstallConfirm` 和 `hideInstallConfirm` 的导入

**修改文件**：`src/renderer/store/thunks/dependencyThunks.ts:10,11,190`

### 3.3 清理 installCommandProgress 相关代码
- [ ] 从 `dependencyThunks.ts` 移除 `executeInstallCommands` thunk（如不再使用）
- [ ] 检查并更新依赖安装相关代码，改用直接 IPC 调用
- [ ] 移除 `openInstallCommandDialog`, `closeInstallCommandDialog`, `addInstallCommandLog`, `updateInstallCommandProgress`, `setInstallCommandStatus`, `setInstallCommandVerification` 的导入和使用

**修改文件**：
- `src/renderer/store/thunks/dependencyThunks.ts`
- 其他使用 `executeInstallCommands` 的组件

## Phase 4: 版本管理页面更新

### 4.1 重构 handleInstallAllDependencies
根据 Phase 1.3 确定的方案，实施以下之一：

**选项 A：使用 installSingleDependency 循环**
- [ ] 重构 `handleInstallAllDependencies` 函数
- [ ] 改为循环调用 `installSingleDependency` 而非 `installFromManifest`
- [ ] 移除 `showInstallConfirm` 的导入和使用

**选项 B：重构 installFromManifest**
- [ ] 修改 `installFromManifest` 接受 `dependencies` 参数
- [ ] 更新 `VersionManagementPage` 传递依赖列表
- [ ] 移除 `showInstallConfirm` 的导入和使用

**修改文件**：`src/renderer/components/VersionManagementPage.tsx:38,372-391`

### 4.2 清理导入
- [ ] 从 `VersionManagementPage.tsx` 移除 `showInstallConfirm` 导入
- [ ] 从 `VersionManagementPage.tsx` 移除 `selectInstallCommandProgress` 导入
- [ ] 从其他使用 `DependencyInstallProgressDialog` 的组件移除相关导入

**需要检查的组件**：
- `src/renderer/components/DependencyCheckCard.tsx`
- `src/renderer/components/DependencyManagementCard.tsx`
- 其他可能引用 `DependencyInstallProgressDialog` 的组件

## Phase 5: 国际化清理

### 5.1 清理英文翻译
- [ ] 从 `src/renderer/i18n/locales/en-US/components.json` 移除 `depInstallConfirm` 对象
- [ ] 从 `src/renderer/i18n/locales/en-US/components.json` 移除 `depInstallWarningBanner` 对象

**修改文件**：`src/renderer/i18n/locales/en-US/components.json:46-66`

### 5.2 清理中文翻译
- [ ] 从 `src/renderer/i18n/locales/zh-CN/components.json` 移除 `depInstallConfirm` 对象
- [ ] 从 `src/renderer/i18n/locales/zh-CN/components.json` 移除 `depInstallWarningBanner` 对象

**修改文件**：`src/renderer/i18n/locales/zh-CN/components.json:46-66`

## Phase 6: 验证与测试

### 6.1 构建验证
- [ ] 运行 `npm run build` 或等效构建命令
- [ ] 确保无 TypeScript 编译错误
- [ ] 确保无未使用的导入警告

### 6.2 功能测试
- [ ] 测试首次启动应用时的 Onboarding 流程
- [ ] 测试 Onboarding 流程中的依赖安装功能
- [ ] 测试版本管理页面的依赖状态显示
- [ ] 测试版本管理页面的依赖刷新功能
- [ ] 测试版本管理页面的单个依赖安装功能（通过 IPC 直接调用）
- [ ] 测试版本管理页面的批量依赖安装功能（如保留）
- [ ] 确认不再弹出命令执行进度对话框
- [ ] 测试已完成 Onboarding 的用户升级后的行为

### 6.3 回归测试
- [ ] 测试版本安装功能
- [ ] 测试版本切换功能
- [ ] 测试版本卸载功能
- [ ] 测试包源配置功能

## Phase 7: 文档更新 (如需要)

- [ ] 更新相关开发文档（如有）
- [ ] 更新用户文档（如有相关说明）

## 执行顺序

```
Phase 1 (分析) → Phase 2 (组件删除) → Phase 3 (状态清理) → Phase 3.3 (命令进度清理) →
Phase 4 (页面更新) → Phase 5 (国际化) → Phase 6 (验证) → Phase 7 (文档)
```

**注意**：
- Phase 1 必须首先完成，以确定需要删除的组件和相关引用
- Phase 3.3 是新增的，用于清理 `installCommandProgress` 相关代码
- 确保在 Phase 4 之前完成所有状态和 thunk 的清理

## 验收标准

变更完成的标准：
1. 应用可以正常构建和运行
2. Onboarding 流程中的依赖安装功能正常
3. 版本管理页面的依赖管理功能正常
4. 无 TypeScript 编译错误
5. 无控制台错误或警告
6. 代码中无遗留的对已删除组件/状态的引用
7. 确认不再显示 `DependencyInstallConfirmDialog` 和 `DependencyInstallProgressDialog`
8. 确认依赖安装通过 IPC 直接调用成功

## 回滚计划

如果发现问题需要回滚：
1. 恢复删除的组件文件：
   - `DependencyInstallConfirmDialog.tsx`
   - `DependencyInstallWarningBanner.tsx`
   - `DependencyInstallProgressDialog.tsx`
2. 恢复 `dependencySlice.ts` 中的状态和 actions：
   - `installConfirm` 状态和相关 actions
   - `installCommandProgress` 状态和相关 actions
3. 恢复 `dependencyThunks.ts` 的导入和 thunks
4. 恢复 `App.tsx` 的组件引用
5. 恢复其他组件对已删除组件的引用
6. 恢复国际化文件中的翻译键
7. 恢复 `VersionManagementPage.tsx` 的原有实现
