# Change: Onboarding Dependency Check Results Display

## Why

用户在引导向导的依赖安装步骤中无法看到完整的依赖检查结果。虽然 Redux Store 中有 `dependencyCheckResults` 数据，但页面展示时内容为空。新的 Manifest 依赖检查命令已实现，但前端界面未完全适配新格式，导致用户无法了解依赖安装状态。

## What Changes

- **补全引导向导依赖检查结果展示** - 确保 `DependencyInstaller` 组件正确读取和显示 `dependencyCheckResults`，使用 Manifest 中的依赖数据填充检查结果（名称、版本、描述、状态）

- **统一版本管理和引导向导的依赖管理界面** - 两个界面共享相同的数据结构和展示逻辑，确保都使用 `ManifestReader` 解析的依赖数据

- **完善依赖检查数据流** - 主进程 → 渲染进程的 IPC 通信正确传递依赖检查结果，Redux Store（`onboardingSlice`）正确存储和更新检查结果

## Impact

**Affected specs**
- `dependency-management` - 依赖管理规范

**Affected code**
- `src/renderer/components/onboarding/steps/DependencyInstaller.tsx` - 引导向导依赖安装步骤组件
- `src/renderer/components/DependencyManagementCardUnified.tsx` - 统一依赖管理卡片组件
- `src/renderer/store/slices/onboardingSlice.ts` - 引导状态管理
- `src/renderer/store/thunks/dependencyThunks.ts` - 依赖操作异步操作
- `src/main/dependency-manager.ts` - 主进程依赖管理器
- `src/main/manifest-reader.ts` - Manifest 读取器
