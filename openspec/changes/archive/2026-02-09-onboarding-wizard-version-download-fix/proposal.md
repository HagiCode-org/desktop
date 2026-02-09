# 提案：修复首次使用引导向导版本下载功能

**提案 ID**: `onboarding-wizard-version-download-fix`
**状态**: ExecutionCompleted
**创建日期**: 2025-02-09
**最后更新**: 2025-02-09（基于实际代码分析）
**目标版本**: 下一代版本

---

## 概述

本提案旨在修复 Hagicode Desktop 首次使用引导向导中的下载进度跟踪和文件大小显示功能，确保用户能够看到实时下载进度、准确的文件大小信息，以及完整的依赖项状态。

**重要说明**：经过代码分析发现，版本获取逻辑已正确实现（`OnboardingManager` 已复用 `VersionManager.listVersions()`），主要问题集中在下载进度传递和大小显示方面。

---

## 问题陈述

### 当前状况（基于实际代码分析）

经过对代码库的详细分析，发现以下实际问题：

#### 1. 下载进度未正确传递 ⚠️

**问题定位**：
- `src/main/version-manager.ts:367` - `installVersion` 调用 `packageSource.downloadPackage()` 时**未传递** `onProgress` 回调
- `src/main/onboarding-manager.ts:139` - `downloadLatestPackage` 使用 `installVersion`，无法接收进度
- `src/main/onboarding-manager.ts:146-153` - 进度更新仅在下载完成后发送，固定为 100%

**影响**：用户无法看到实时下载进度

#### 2. 下载大小显示为 0 字节 ⚠️

**问题定位**：
- `src/renderer/store/slices/onboardingSlice.ts:114-121` - `downloadPackage.fulfilled` 中设置固定值：
  ```typescript
  state.downloadProgress = {
    progress: 100,
    downloadedBytes: 0,  // ❌ 固定为 0
    totalBytes: 0,       // ❌ 固定为 0
    speed: 0,
    remainingSeconds: 0,
    version: action.payload.version,
  };
  ```
- 主进程 `OnboardingManager.downloadLatestPackage()` 在 `onProgress` 回调中传递了 `result.version.size`，但渲染进程未正确使用

**影响**：下载完成后显示文件大小为 "0 B"

#### 3. 依赖项展示功能正常 ✅

**发现**：
- `src/renderer/components/onboarding/steps/DependencyInstaller.tsx` 已正确实现依赖项展示
- `src/main/onboarding-manager.ts:173-273` - `installDependencies` 方法完整实现依赖项检查和安装
- 支持显示依赖项状态（pending、installing、installed、error）

**无需修复**

---

## 建议解决方案

### 核心原则

1. **最小变更**：仅修复必要的代码路径
2. **保持架构**：不改变现有的分层架构（VersionManager → OnboardingManager → IPC → Redux）
3. **增量改进**：逐步添加功能，不破坏现有行为

### 技术方案

#### 1. 下载进度传递修复

**变更点**：`src/main/version-manager.ts`

需要将 `onProgress` 回调从 `OnboardingManager` 传递到 `packageSource.downloadPackage()`：

```typescript
// 版本管理器需要支持进度回调
async installVersion(
  versionId: string,
  onProgress?: (progress: DownloadProgressCallback) => void
): Promise<InstallResult> {
  // ...
  await packageSource.downloadPackage(targetVersion, cachePath, onProgress);
  // ...
}
```

**连锁变更**：
- `src/main/onboarding-manager.ts:139` - 传递进度回调给 `installVersion`
- 确保 `Version` 接口的 `size` 字段在下载前可用于计算

#### 2. 下载大小显示修复

**方案 A（推荐）**：在 Redux slice 中使用实际大小值

**变更点**：`src/renderer/store/slices/onboardingSlice.ts`

修改 `downloadPackage.fulfilled` 处理：

```typescript
.addCase(downloadPackage.fulfilled, (state, action) => {
  if (action.payload.version) {
    state.downloadProgress = {
      progress: 100,
      downloadedBytes: action.payload.size || 0,  // ✅ 使用实际大小
      totalBytes: action.payload.size || 0,       // ✅ 使用实际大小
      speed: 0,
      remainingSeconds: 0,
      version: action.payload.version,
    };
  }
})
```

**前提**：IPC 通道需要返回 `size` 字段

**方案 B（备选）**：通过进度事件在下载开始时发送文件大小

在 `OnboardingManager.downloadLatestPackage()` 开始时发送初始进度：

```typescript
async downloadLatestPackage(onProgress?: (progress: DownloadProgress) => void) {
  const versions = await this.versionManager.listVersions();
  const latestVersion = versions[0];

  // 立即发送初始进度（包含文件大小）
  if (onProgress) {
    onProgress({
      progress: 0,
      downloadedBytes: 0,
      totalBytes: latestVersion.size || 0,
      speed: 0,
      remainingSeconds: 0,
      version: latestVersion.id,
    });
  }

  // 继续下载...
}
```

---

## 实施范围

### 包含内容

| 组件 | 操作 | 优先级 |
|-----|------|--------|
| `VersionManager.installVersion` | 添加 `onProgress` 参数 | P0 |
| `OnboardingManager.downloadLatestPackage` | 传递进度回调，发送初始大小 | P0 |
| `onboardingSlice` | 使用实际下载大小值 | P0 |
| IPC 类型定义 | 确保 `size` 字段传递 | P0 |
| `PackageDownload` 组件 | 已支持显示大小，无需修改 | - |

### 排除内容

- ✅ 依赖项展示（已正确实现）
- ✅ 版本获取逻辑（已使用 `VersionManager.listVersions()`）
- UI/UX 重新设计
- 后端 API 修改

---

## 架构分析

### 当前数据流

```
1. 版本列表获取（✅ 正常）
   VersionManager.listVersions()
   → OnboardingManager.downloadLatestPackage()
   → IPC: onboarding:download-package
   → Redux: downloadPackage thunk

2. 下载过程（⚠️ 问题）
   VersionManager.installVersion()
   → packageSource.downloadPackage(version, cachePath) [❌ 无回调]
   → 安装完成
   → OnboardingManager 发送 100% 进度

3. 进度传递（⚠️ 问题）
   主进程 → IPC: onboarding:download-progress
   → 渲染进程接收
   → onboardingSlice.setDownloadProgress()
```

### 目标数据流

```
1. 开始下载前
   获取 latestVersion.size
   → 发送初始进度 { progress: 0, totalBytes: size }

2. 下载过程中
   VersionManager.installVersion(versionId, onProgress)
   → packageSource.downloadPackage(..., onProgress)
   → 实时更新进度
   → IPC 发送到渲染进程

3. 下载完成
   → Redux 使用实际大小值
   → UI 正确显示
```

---

## 潜在风险与缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| VersionManager 接口变更影响其他调用者 | 中 | 低 | 添加可选参数，向后兼容 |
| 进度回调传递链断裂 | 高 | 中 | 添加日志验证回调传递 |
| 大小字段在某些版本源中不可用 | 中 | 中 | 提供默认值 0 或 undefined |

---

## 成功标准

### 功能验收标准

- [ ] 下载前显示文件总大小
- [ ] 下载过程中实时更新进度（0-100%）
- [ ] 下载完成后显示实际文件大小（非 0 B）
- [ ] 所有平台功能正常（Windows、macOS、Linux）

### 技术验收标准

- [ ] `VersionManager.installVersion` 接受并传递 `onProgress` 回调
- [ ] `onboardingSlice` 存储正确的 `totalBytes` 值
- [ ] IPC 通道传递 `size` 字段
- [ ] 不破坏现有版本管理功能

---

## 相关文件

### 需要修改的文件

| 文件 | 变更类型 | 优先级 |
|-----|---------|--------|
| `src/main/version-manager.ts` | 接口扩展 | P0 |
| `src/main/onboarding-manager.ts` | 回调传递 | P0 |
| `src/renderer/store/slices/onboardingSlice.ts` | 数据修正 | P0 |
| `src/preload/index.ts` | 类型检查 | P1 |

### 无需修改的文件（已验证）

| 文件 | 状态 | 说明 |
|-----|------|------|
| `src/renderer/components/onboarding/steps/PackageDownload.tsx` | ✅ 正常 | 已支持大小显示和进度 |
| `src/renderer/components/onboarding/steps/DependencyInstaller.tsx` | ✅ 正常 | 依赖项展示完整 |
| `src/types/onboarding.ts` | ✅ 正常 | 类型定义正确 |

---

## 实施时间线

| 阶段 | 任务 | 优先级 | 预估工作量 |
|-----|------|--------|----------|
| 第一阶段 | VersionManager 接口扩展 | P0 | 核心 |
| 第二阶段 | OnboardingManager 回调传递 | P0 | 核心 |
| 第三阶段 | Redux slice 数据修正 | P0 | 核心 |
| 第四阶段 | 测试与验证 | P0 | 质量保证 |

---

## 附录：代码分析发现

### 正确实现的部分 ✅

1. **版本获取** (`onboarding-manager.ts:127`)
   ```typescript
   const versions = await this.versionManager.listVersions();
   const latestVersion = versions[0]; // 已按发布时间排序
   ```

2. **依赖项展示** (`DependencyInstaller.tsx`)
   - 完整的 UI 实现
   - 状态图标正确显示
   - 进度条和错误处理完善

3. **进度类型定义** (`onboarding.ts:18-25`)
   ```typescript
   interface DownloadProgress {
     progress: number;
     downloadedBytes: number;
     totalBytes: number;
     speed: number;
     remainingSeconds: number;
     version: string;
   }
   ```

### 需要修复的部分 ⚠️

1. **进度回调缺失** (`version-manager.ts:367`)
   ```typescript
   // 当前：
   await packageSource.downloadPackage(targetVersion, cachePath);

   // 需要：
   await packageSource.downloadPackage(targetVersion, cachePath, onProgress);
   ```

2. **Redux slice 固定值** (`onboardingSlice.ts:116-117`)
   ```typescript
   // 当前：
   downloadedBytes: 0,
   totalBytes: 0,

   // 需要：
   downloadedBytes: action.payload.totalBytes || 0,
   totalBytes: action.payload.size || 0,
   ```

---

## 审核清单

- [ ] 技术负责人审核
- [ ] 产品经理确认
- [ ] 安全评估（无需，无敏感数据处理）
- [ ] 文档更新确认（用户文档可能需要更新下载说明）
