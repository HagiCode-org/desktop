# 优化依赖安装逻辑为单次脚本调用

## 元数据

- **变更ID**: `optimize-dependency-installation-single-script-call`
- **创建日期**: 2026-02-15
- **状态**: 已实施
- **优先级**: 中等
- **复杂性**: 简单

## 概述

优化依赖安装逻辑，确保当用户点击"立即安装"按钮时，无论缺失依赖项数量多少，只调用一次 Install 脚本来批量安装所有依赖项，而不是对每个依赖项单独调用安装脚本。

## 背景

### 当前问题分析

在版本管理界面中，当检测到多个缺失依赖项时，用户点击"立即安装"按钮会触发多次重复的 Install 脚本调用：

**当前实现中的问题路径**：
1. **VersionManagementPage 组件** (`src/renderer/components/VersionManagementPage.tsx:379-395`)
   - `handleInstallAllDependencies` 方法正确调用了 `installFromManifest` thunk
   - 传递了所有需要安装的依赖项列表

2. **installFromManifest thunk** (`src/renderer/store/thunks/dependencyThunks.ts:161-240`)
   - 正确调用 `window.electronAPI.installFromManifest(versionId)`
   - 没有循环调用问题

3. **OnboardingManager** (`src/main/onboarding-manager.ts:305-370`)
   - **发现问题**: 在 `installDependencies` 方法中存在循环调用
   - 对每个缺失依赖项单独调用 `installSingleDependency(dep, entryPoint)`
   - 这是问题的根源

**问题代码位置**:
```typescript
// src/main/onboarding-manager.ts:305-370
for (const dep of dependenciesToInstall) {
  const installResult = await this.dependencyManager.installSingleDependency(dep, entryPoint);
  // 每个依赖项都触发一次脚本执行
}
```

### 影响范围

- **功能影响**: Onboarding 流程中的依赖安装效率低下
- **用户体验影响**: 安装过程冗长，多次脚本启动开销
- **性能影响**: 每个依赖项都会触发完整的脚本启动和执行流程

## 目标

### 主要目标

1. **单次脚本调用**: 无论缺失依赖项数量多少，只调用一次 Install 脚本
2. **依赖集合传递**: 将所有需要安装的依赖项作为参数集合传递给脚本
3. **脚本自动处理**: Install 脚本内部负责批量处理所有依赖项的安装

### 预期行为

```
检测到 5 个缺失依赖项 → 收集依赖项列表 →
调用一次 Install 脚本（传入完整列表） →
脚本内部批量安装所有依赖项 →
返回 install-result.json 包含每个依赖的安装结果
```

## 范围

### 包含内容

1. **OnboardingManager 修改**
   - 修改 `installDependencies` 方法
   - 使用 `installFromManifest` 替代循环调用 `installSingleDependency`

2. **进度报告优化**
   - 调整进度报告逻辑以适配单次批量调用
   - 解析 `install-result.json` 获取单个依赖的进度

3. **测试验证**
   - 验证多依赖项安装只触发一次脚本调用
   - 验证安装结果正确性

### 排除内容

- 修改 Install 脚本本身的实现（脚本已支持批量安装）
- 修改 `dependency-manager.ts` 的核心逻辑（已实现批量安装功能）
- 修改 VersionManagementPage 组件（已正确使用批量安装）

## 技术分析

### 现有基础设施

代码库中已经存在正确的批量安装实现：

1. **DependencyManager.installFromManifest()** (`src/main/dependency-manager.ts:768-929`)
   - 执行安装脚本一次
   - 读取 `install-result.json` 获取每个依赖的结果
   - 支持进度回调

2. **install-result.json 格式**
   ```json
   {
     "success": true,
     "dependencies": {
       "claudeCode": { "success": true },
       "dotnet": { "success": false, "error": "..." }
     }
   }
   ```

### 需要修改的组件

| 组件 | 文件 | 修改类型 | 说明 |
|------|------|----------|------|
| OnboardingManager | `src/main/onboarding-manager.ts` | 重构 | 使用 `installFromManifest` 替代循环调用 |

### 依赖关系

- 依赖 `DependencyManager.installFromManifest` 的现有实现
- 依赖 manifest 的 `entryPoint.install` 配置
- 依赖 Install 脚本生成 `install-result.json`

## 成功标准

### 功能验收标准

1. ✅ **单次脚本调用**: 安装 5 个依赖项时，Install 脚本只执行一次
2. ✅ **结果正确性**: 所有依赖项的安装状态正确反映在 UI 中
3. ✅ **进度报告**: 用户能看到安装进度反馈
4. ✅ **错误处理**: 失败的依赖项能正确显示错误信息

### 性能验收标准

1. **安装时间**: 多依赖项安装时间显著减少（减少脚本启动开销）
2. **资源占用**: 减少并发进程数量

## 风险与缓解

### 潜在风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 进度报告粒度降低 | 中 | 低 | 解析 install-result.json 获取单个依赖进度 |
| 安装失败时回退复杂度增加 | 低 | 低 | 保留 installSingleDependency 作为独立功能 |
| 现有脚本不兼容批量调用 | 高 | 低 | 脚本已支持批量安装 |

### 回退计划

如果批量安装出现问题，可以：
1. 保留 `installSingleDependency` 方法用于单个依赖安装
2. 在 OnboardingManager 中添加降级逻辑，失败时回退到循环调用

## 替代方案

### 方案 A：循环调用 installSingleDependency（当前实现）
- **优点**: 进度报告精确，错误处理简单
- **缺点**: 性能低下，多次脚本启动开销
- **状态**: 当前实现

### 方案 B：单次调用 installFromManifest（推荐）
- **优点**: 性能优化，减少脚本启动开销
- **缺点**: 需要调整进度报告逻辑
- **状态**: 推荐方案

## 实施计划

详见 `tasks.md` 文件。

## 参考资料

- `src/main/dependency-manager.ts:768-929` - `installFromManifest` 实现
- `src/main/onboarding-manager.ts:305-370` - 当前循环调用位置
- `src/renderer/store/thunks/dependencyThunks.ts:161-240` - 批量安装 thunk
