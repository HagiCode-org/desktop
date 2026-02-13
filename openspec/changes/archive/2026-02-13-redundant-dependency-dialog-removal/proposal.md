# Proposal: 移除冗余依赖安装弹窗组件

## Change ID
`redundant-dependency-dialog-removal`

## Status
**Proposed**

## Overview
移除 Hagicode Desktop 应用中已冗余的依赖安装弹窗组件，统一依赖安装流程到 Onboarding（首次使用引导）流程中，简化用户体验并减少代码维护负担。

## Context / 背景

Hagicode Desktop 应用当前在依赖管理流程中存在一个独立的弹窗组件 `DependencyInstallConfirmDialog`，用于在版本管理页面中提示用户安装缺失的依赖项。然而，随着应用架构演进：

1. **Onboarding 流程已完善**：依赖安装功能已经完全整合到首次使用引导流程中，实现了"一键安装"体验
2. **UI 模式升级**：新的 Onboarding 流程使用内联的依赖检查结果展示，配合单个依赖安装按钮，替代了原有的批量确认弹窗
3. **架构决策**：依赖安装现在通过 `DependencyInstaller` 组件在 Onboarding 流程中处理，提供更直观的用户体验

原有的独立依赖安装弹窗已经成为冗余功能，与新的设计理念冲突。

## Problem / 问题

当前存在的具体问题：

1. **功能冗余**：`DependencyInstallConfirmDialog` 组件与 Onboarding 流程中的 `DependencyInstaller` 组件功能重叠
2. **用户体验不一致**：用户可能会在 Onboarding 流程完成安装后，仍然在版本管理页面看到独立的依赖安装弹窗
3. **代码维护负担**：
   - 维护两套依赖安装入口增加了代码复杂度
   - `dependencySlice` 中存在专门用于弹窗的状态（`installConfirm`）
   - 国际化文件中存在重复的翻译键
4. **UI 流程混乱**：独立的弹窗与整合的引导流程并存，导致用户对依赖安装状态产生困惑

## Solution / 解决方案

### 核心策略
移除原有的独立依赖安装弹窗组件及其相关代码，将依赖安装流程完全统一到 Onboarding 和版本管理的内联 UI 中。

### 具体实施

#### 1. 组件移除
- **删除** `DependencyInstallConfirmDialog.tsx` - 独立的依赖安装确认弹窗
- **删除** `DependencyInstallWarningBanner.tsx` - 依赖安装警告横幅（如确认不再使用）
- **删除** `DependencyInstallProgressDialog.tsx` - 命令执行进度弹窗（使用 IPC Install Command/Check Command 替代）

#### 2. 状态管理清理 (`dependencySlice.ts`)
移除以下状态和操作：
- `installConfirm` 状态对象（包含 `show`, `dependencies`, `versionId`, `context`）
- `showInstallConfirm` action
- `hideInstallConfirm` action
- 相关 selectors: `selectShowInstallConfirm`, `selectPendingDependencies`, `selectInstallConfirmVersionId`, `selectInstallConfirmContext`

**保留**：
- `installProgress` 状态 - 仍用于 Onboarding 流程中的安装进度显示
- `startInstall`, `updateInstallProgress`, `completeInstall` actions - Onboarding 流程需要

**移除**：
- `installCommandProgress` 状态 - 不再需要命令进度弹窗，直接使用 IPC 调用
- `openInstallCommandDialog`, `closeInstallCommandDialog` actions
- `addInstallCommandLog`, `updateInstallCommandProgress`, `setInstallCommandStatus`, `setInstallCommandVerification` actions
- 相关 selectors: `selectInstallCommandProgress`
- `InstallCommandLog` 接口定义
- `InstallCommandProgress` 接口定义

#### 3. Redux Thunk 清理 (`dependencyThunks.ts`)
- **修改** `installFromManifest` thunk：移除对 `showInstallConfirm` 状态的依赖
  - 不再从 `state.dependency.installConfirm` 获取依赖列表
  - 改为直接从 `onboardingSlice` 或通过参数传递依赖信息
- **移除** `checkDependenciesAfterInstall` 中的弹窗显示逻辑（已注释，清理确认）

#### 4. 组件引用清理
- **修改** `App.tsx`：移除 `<DependencyInstallConfirmDialog />` 和 `<DependencyInstallProgressDialog />` 组件引用
- **修改** `VersionManagementPage.tsx`：
  - 移除 `showInstallConfirm` 导入和使用
  - 移除 `selectInstallCommandProgress` 导入和使用
  - 更新 `handleInstallAllDependencies` 函数：
    - 不再调用 `showInstallConfirm` action
    - 直接触发 `installFromManifest` 或使用单个依赖安装流程
- **检查并更新**其他使用 `DependencyInstallProgressDialog` 的组件（如 `DependencyCheckCard`, `DependencyManagementCard`）

#### 5. 国际化清理
从以下文件中移除相关翻译键：
- `locales/en-US/components.json`:
  - 移除 `depInstallConfirm` 对象
  - 移除 `depInstallWarningBanner` 对象
- `locales/zh-CN/components.json`:
  - 移除对应的中文翻译

#### 6. IPC 和主进程
- **检查** `dependency-manager.ts` 和相关主进程代码
- 移除任何触发 `showInstallConfirm` 弹窗的逻辑（如有）

## Impact / 影响

### 用户体验改进
| 改进项 | 描述 |
|--------|------|
| 流程简化 | 用户统一通过 Onboarding 流程或版本管理页面的内联 UI 完成依赖安装 |
| 减少混淆 | 消除了多处提示安装依赖的混乱情况 |
| 明确路径 | 依赖安装的入口点更加清晰（首次启动时或版本管理页面中） |

### 代码库影响
| 指标 | 变化 |
|------|------|
| 代码减少 | 预计移除约 400-500 行代码（包括进度对话框组件和相关状态管理） |
| 维护性提升 | 单一责任点，依赖安装逻辑仅在 Onboarding 流程中维护 |
| 复杂度降低 | 减少 Redux 状态管理复杂度，移除不必要的弹窗状态 |

### 风险评估
| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 老用户兼容性 | 低 | 确保已完成 Onboarding 的老用户不受影响 |
| 功能完整性 | 低 | Onboarding 流程中的依赖安装功能已充分测试 |
| 用户习惯改变 | 中 | 新用户直接使用新流程；老用户通过版本管理页面内联 UI 操作 |

## Dependencies / 依赖

- 无外部依赖
- 可独立实施，不影响其他功能模块

## Success Criteria / 成功标准

### 功能验证
- [ ] 应用启动后不显示依赖安装弹窗
- [ ] Onboarding 流程中的依赖安装功能正常工作
- [ ] 版本管理页面中可以正常查看和刷新依赖状态
- [ ] 单个依赖安装功能正常（直接调用 IPC `installCommand` 和 `checkCommand`）
- [ ] 确认不再弹出命令执行进度对话框

### 回归测试
- [ ] 首次安装应用后 Onboarding 流程正常
- [ ] 已完成 Onboarding 的老用户升级后不受影响
- [ ] 版本切换、安装、卸载功能正常
- [ ] 应用构建无 TypeScript 错误

### 代码质量
- [ ] 无未使用的导入或变量
- [ ] 国际化文件无无效引用
- [ ] Redux store 状态精简，无冗余状态

## Alternatives Considered / 备选方案

### 方案 A：保留弹窗但重构
**优点**：向后兼容性更好
**缺点**：继续维护冗余代码，违背架构简化目标
**结论**：不采用，新架构已足够完善

### 方案 B：逐步迁移
**优点**：风险更低，可以逐步验证
**缺点**：实施周期长，两套系统并存期会带来更多混乱
**结论**：不采用，一次性移除更清晰

## Open Questions / 待解决问题

1. **确认**：`DependencyInstallWarningBanner` 组件是否仍在其他地方使用？
   - 需要搜索确认是否只有 `DependencyInstallWarningBanner` 自己引用
   - 如无其他引用，可以一并删除

2. **确认**：`DependencyInstallProgressDialog` 组件是否仍在其他地方使用？
   - 需要搜索确认 `DependencyCheckCard`, `DependencyManagementCard` 等组件的引用
   - 确认是否需要将这些组件改为直接调用 IPC 而非使用进度对话框

3. **确认**：版本管理页面中的"一键安装所有依赖"功能是否需要保留？
   - 当前实现使用 `showInstallConfirm` → `installFromManifest` 流程
   - 移除后可能需要改用循环调用单个 IPC 安装命令

4. **确认**：`installFromManifest` thunk 的调用方式需要调整
   - 当前依赖 `state.dependency.installConfirm.dependencies`
   - 需要改为从 `onboardingSlice` 获取或通过参数传递

## Timeline / 时间表

- 预计工作量：2-3 小时
- 实施步骤：详见 `tasks.md`
