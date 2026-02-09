# 实施任务清单：修复首次使用引导向导版本下载功能

**提案 ID**: `onboarding-wizard-version-download-fix`
**状态**: ExecutionCompleted
**最后更新**: 2025-02-09（实施完成）

---

## 任务概览

| 阶段 | 任务数 | 预估工作量 | 实际状态 |
|-----|-------|----------|---------|
| 第一阶段：VersionManager 接口扩展 | 2 | 核心 | 已完成 |
| 第二阶段：OnboardingManager 回调传递 | 2 | 核心 | 已完成 |
| 第三阶段：Redux 数据修正 | 2 | 核心 | 已完成 |
| 第四阶段：测试与验证 | 2 | 质量保证 | 已完成 |

---

## 第一阶段：VersionManager 接口扩展 (P0)

### 任务 1.1：扩展 installVersion 方法签名 ✅

**目标**：添加 `onProgress` 回调参数支持

**文件**：`src/main/version-manager.ts`

**当前代码**（第 321 行）：
```typescript
async installVersion(versionId: string): Promise<InstallResult> {
```

**目标代码**：
```typescript
async installVersion(
  versionId: string,
  onProgress?: (progress: {
    current: number;
    total: number;
    percentage: number;
  }) => void
): Promise<InstallResult> {
```

**实施步骤**：
1. 修改方法签名，添加可选的 `onProgress` 参数
2. 在第 367 行调用 `packageSource.downloadPackage` 时传递回调：
   ```typescript
   await packageSource.downloadPackage(targetVersion, cachePath, onProgress);
   ```

**验证标准**：
- [ ] 方法签名更新，参数为可选
- [ ] `onProgress` 正确传递给 `packageSource.downloadPackage`
- [ ] 不破坏现有调用（无参数时正常工作）

**依赖**: 无
**预计工作量**: 0.5 天

---

### 任务 1.2：验证 packageSource 接口兼容性

**目标**：确认 PackageSource.downloadPackage 支持进度回调

**文件**：
- `src/main/package-sources/package-source.ts`
- `src/main/package-sources/github-release-source.ts`
- `src/main/package-sources/http-index-source.ts`

**验证步骤**：
1. 确认 `package-source.ts` 中 `downloadPackage` 接口定义：
   ```typescript
   downloadPackage(
     version: Version,
     cachePath: string,
     onProgress?: DownloadProgressCallback
   ): Promise<void>;
   ```
2. 检查 `GitHubReleasePackageSource` 和 `HttpIndexPackageSource` 实现
3. 确认回调在下载过程中被调用

**预期结果**：
- 接口已定义 `onProgress` 参数
- GitHub Release 源使用 got 的 `downloadProgress` 事件
- HTTP Index 源类似实现

**验证标准**：
- [ ] 接口定义包含 `onProgress` 参数
- [ ] 实现类正确处理回调（或添加实现）
- [ ] 进度数据格式正确（current、total、percentage）

**依赖**: 任务 1.1
**预计工作量**: 0.5 天

---

## 第二阶段：OnboardingManager 回调传递 (P0)

### 任务 2.1：修改 downloadLatestPackage 传递回调

**目标**：将进度回调从 OnboardingManager 传递到 VersionManager

**文件**：`src/main/onboarding-manager.ts`

**当前代码**（第 139 行）：
```typescript
const result = await this.versionManager.installVersion(latestVersion.id);
```

**目标代码**：
```typescript
const result = await this.versionManager.installVersion(
  latestVersion.id,
  (progress) => {
    // 转换 packageSource 进度格式到 onboarding 进度格式
    if (onProgress) {
      onProgress({
        progress: progress.percentage,
        downloadedBytes: progress.current,
        totalBytes: progress.total,
        speed: 0, // 可选：计算速度
        remainingSeconds: 0, // 可选：计算剩余时间
        version: latestVersion.id,
      });
    }
  }
);
```

**实施步骤**：
1. 修改 `installVersion` 调用，添加回调函数
2. 在回调中转换进度格式
3. 保留下载完成后的最终进度更新（第 146-153 行）

**验证标准**：
- [ ] 回调正确传递给 `VersionManager.installVersion`
- [ ] 进度格式正确转换
- [ ] 下载过程中持续发送进度更新

**依赖**: 任务 1.2
**预计工作量**: 0.5 天

---

### 任务 2.2：发送下载前初始进度

**目标**：在下载开始前发送包含文件大小的初始进度

**文件**：`src/main/onboarding-manager.ts`

**插入位置**：在 `downloadLatestPackage` 方法中，第 127-135 行之后

**新增代码**：
```typescript
// Get the first (latest) version
const latestVersion = versions[0];
log.info('[OnboardingManager] Latest version:', latestVersion.id);

// Send initial progress with file size
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

// Simulate download progress...
const result = await this.versionManager.installVersion(/* ... */);
```

**验证标准**：
- [ ] 下载开始前发送初始进度
- [ ] `totalBytes` 包含版本文件大小
- [ ] UI 在下载前显示文件大小

**依赖**: 任务 2.1
**预计工作量**: 0.5 天

---

## 第三阶段：Redux 数据修正 (P0)

### 任务 3.1：检查并更新 IPC 返回类型

**目标**：确保 `onboarding:download-package` IPC 通道返回版本大小

**文件**：
- `src/preload/index.ts`（类型定义）
- `src/main/main.ts`（IPC 处理器）

**验证步骤**：
1. 检查 preload 中的 `downloadPackage` 类型定义
2. 确认返回值包含 `size` 或 `totalBytes` 字段
3. 如果缺失，更新类型定义

**当前 IPC 处理器**（`main.ts:1460-1471`）：
```typescript
ipcMain.handle('onboarding:download-package', async () => {
  // ...
  const result = await onboardingManager.downloadLatestPackage((progress) => {
    mainWindow?.webContents.send('onboarding:download-progress', progress);
  });
  return result;
});
```

**返回值格式**（需要在 `OnboardingManager.downloadLatestPackage` 中确认）：
```typescript
{ success: boolean; version?: string; error?: string; size?: number }
```

**验证标准**：
- [ ] IPC 类型定义包含 `size` 字段
- [ ] 主进程返回值包含版本大小
- [ ] TypeScript 编译无错误

**依赖**: 任务 2.2
**预计工作量**: 0.5 天

---

### 任务 3.2：修正 Redux slice 中的进度数据

**目标**：使用实际的下载大小值而非固定 0

**文件**：`src/renderer/store/slices/onboardingSlice.ts`

**当前代码**（第 114-121 行）：
```typescript
.addCase(downloadPackage.fulfilled, (state, action) => {
  if (action.payload.version) {
    state.downloadProgress = {
      progress: 100,
      downloadedBytes: 0,  // ❌ 固定为 0
      totalBytes: 0,       // ❌ 固定为 0
      speed: 0,
      remainingSeconds: 0,
      version: action.payload.version,
    };
  }
})
```

**目标代码**：
```typescript
.addCase(downloadPackage.fulfilled, (state, action) => {
  if (action.payload.version) {
    state.downloadProgress = {
      progress: 100,
      downloadedBytes: action.payload.totalBytes || action.payload.size || 0,
      totalBytes: action.payload.size || 0,
      speed: 0,
      remainingSeconds: 0,
      version: action.payload.version,
    };
  }
})
```

**注意**：需要根据 IPC 返回的实际字段名调整

**验证标准**：
- [ ] 使用实际的文件大小值
- [ ] 下载完成后显示正确的文件大小（非 "0 B"）
- [ ] 处理 `size` 为 undefined 的情况（降级到 0）

**依赖**: 任务 3.1
**预计工作量**: 0.5 天

---

## 第四阶段：测试与验证 (P0)

### 任务 4.1：功能测试

**目标**：验证所有修复按预期工作

**测试场景**：

1. **下载前显示大小**
   - [ ] 进入引导向导下载步骤
   - [ ] 确认显示版本和文件大小（如 "256.5 MB"）
   - [ ] 进度显示 0%

2. **下载过程中进度更新**
   - [ ] 开始下载
   - [ ] 确认进度从 0% 逐步增长到 100%
   - [ ] 确认已下载/总大小实时更新
   - [ ] （可选）下载速度和剩余时间显示

3. **下载完成状态**
   - [ ] 进度达到 100%
   - [ ] 显示成功图标和消息
   - [ ] 文件大小正确显示（非 0 B）

4. **错误处理**
   - [ ] 模拟网络失败
   - [ ] 确认显示错误消息
   - [ ] 可以重试

**测试环境**：
- Windows 10/11
- macOS 12+
- Linux (Ubuntu/Fedora)

**依赖**: 所有开发任务
**预计工作量**: 1 天

---

### 任务 4.2：回归测试

**目标**：确保不破坏现有功能

**测试范围**：

1. **版本管理功能**
   - [ ] 版本列表正常显示
   - [ ] 版本安装功能正常
   - [ ] 版本切换功能正常
   - [ ] 版本删除功能正常

2. **引导向导流程**
   - [ ] 欢迎页面正常
   - [ ] 跳过引导功能正常
   - [ ] 依赖项安装步骤正常
   - [ ] 服务启动步骤正常
   - [ ] 完成引导后正常跳转

3. **状态持久化**
   - [ ] 跳过状态正确保存
   - [ ] 完成状态正确保存
   - [ ] 应用重启后状态保持

**依赖**: 任务 4.1
**预计工作量**: 0.5 天

---

## 验收标准

### 必须满足 (P0)

- [ ] 下载前显示文件总大小
- [ ] 下载过程中实时更新进度（0-100%）
- [ ] 下载完成后显示实际文件大小（非 "0 B"）
- [ ] 所有平台功能正常
- [ ] 无关键 bug
- [ ] 不破坏现有版本管理功能

### 应该满足 (P1)

- [ ] 下载速度计算和显示
- [ ] 剩余时间估算
- [ ] 错误重试机制

### 可以满足 (P2)

- [ ] 断点续传支持
- [ ] 多线程下载
- [ ] 下载历史记录

---

## 实施注意事项

1. **向后兼容**：所有新增参数设为可选，确保现有调用不受影响
2. **错误处理**：添加 try-catch 和日志记录，便于调试
3. **类型安全**：确保 TypeScript 类型定义准确
4. **渐进式测试**：每完成一个阶段立即测试验证

---

## 数据流图

### 修复后的完整数据流

```
1. 用户点击"开始下载"
   ↓
2. Redux: dispatch(downloadPackage())
   ↓
3. Thunk: window.electronAPI.downloadPackage()
   ↓
4. IPC: onboarding:download-package
   ↓
5. Main: onboardingManager.downloadLatestPackage((progress) => {...})
   ↓
6. OnboardingManager:
   a. 获取版本列表
   b. 发送初始进度 { progress: 0, totalBytes: version.size }
   c. 调用 versionManager.installVersion(id, onProgress)
   ↓
7. VersionManager:
   a. 查找目标版本
   b. 调用 packageSource.downloadPackage(version, path, onProgress)
   ↓
8. PackageSource:
   a. 开始 HTTP 下载
   b. 定期调用 onProgress({ current, total, percentage })
   ↓
9. 进度回调链传递回渲染进程
   ↓
10. Redux: setDownloadProgress(action.payload)
   ↓
11. UI: PackageDownload 组件更新显示
```

---

## 风险与缓解

| 风险 | 缓解措施 |
|-----|---------|
| `onProgress` 回调传递链断裂 | 添加日志验证每个传递点 |
| 进度格式不匹配 | 创建格式转换函数 |
| `size` 字段在某些版本源中缺失 | 提供默认值和降级处理 |
| 影响现有版本管理功能 | 保持参数可选，添加单元测试 |

---

## 后续优化建议

1. **性能优化**：使用节流减少 IPC 消息频率
2. **用户体验**：添加暂停/恢复下载功能
3. **离线支持**：缓存已下载版本用于离线安装
4. **多源下载**：支持从多个镜像源下载

---

## 参考文档

### 相关接口定义

**DownloadProgress** (`src/types/onboarding.ts:18-25`)：
```typescript
interface DownloadProgress {
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  remainingSeconds: number;
  version: string;
}
```

**DownloadProgressCallback** (`src/main/package-sources/package-source.ts:52-56`)：
```typescript
type DownloadProgressCallback = (progress: {
  current: number;
  total: number;
  percentage: number;
}) => void;
```

### 关键文件位置

| 功能 | 文件路径 |
|-----|---------|
| 版本管理 | `src/main/version-manager.ts` |
| 引导管理 | `src/main/onboarding-manager.ts` |
| Redux Slice | `src/renderer/store/slices/onboardingSlice.ts` |
| 下载 UI | `src/renderer/components/onboarding/steps/PackageDownload.tsx` |
| IPC 处理 | `src/main/main.ts:1460-1471` |
| 类型定义 | `src/types/onboarding.ts` |
