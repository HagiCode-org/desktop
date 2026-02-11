# 依赖安装进度对话框 - 实施任务

## 阶段 1：基础架构

### 1.1 扩展 IPC 通信层

**文件**: `src/preload/index.ts`

- [ ] 添加新的 IPC 通道定义：
  ```typescript
  executeInstallCommands: (commands: string[], workingDirectory?: string) => ipcRenderer.invoke('dependency:execute-commands', commands, workingDirectory),
  onInstallCommandProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('dependency:command-progress', listener);
    return () => ipcRenderer.removeListener('dependency:command-progress', listener);
  },
  ```

### 1.2 扩展状态管理

**文件**: `src/renderer/store/slices/dependencySlice.ts`

- [ ] 添加新的状态类型：
  ```typescript
  export interface InstallCommandLog {
    timestamp: number;
    type: 'info' | 'error' | 'warning';
    message: string;
  }

  export interface InstallCommandProgress {
    isOpen: boolean;
    commands: string[];
    currentCommandIndex: number;
    isExecuting: boolean;
    logs: InstallCommandLog[];
    status: 'idle' | 'executing' | 'success' | 'error';
    error?: string;
  }
  ```

- [ ] 添加新的 actions：
  - `openInstallDialog(commands: string[])`
  - `closeInstallDialog()`
  - `addInstallLog(log: InstallCommandLog)`
  - `updateCommandProgress(index: number)`
  - `setInstallStatus(status: 'success' | 'error', error?: string)`

### 1.3 扩展 Saga

**文件**: `src/renderer/store/sagas/dependencySaga.ts`

- [ ] 添加新的 action 类型常量
- [ ] 实现 `executeInstallCommands` worker saga
- [ ] 实现进度监听器设置

## 阶段 2：主进程实现

### 2.1 增强命令执行

**文件**: `src/main/dependency-manager.ts`

- [ ] 添加新方法 `executeCommandsWithProgress`：
  ```typescript
  async executeCommandsWithProgress(
    commands: string[],
    workingDirectory: string,
    onProgress?: (progress: CommandProgress) => void
  ): Promise<{ success: boolean; error?: string }>
  ```

- [ ] 使用 `spawn` 替代 `exec` 以获取实时输出
- [ ] 捕获 stdout 和 stderr
- [ ] 处理命令执行错误

### 2.2 添加 IPC 处理器

**文件**: `src/main/main.ts`

- [ ] 添加 `dependency:execute-commands` 处理器
- [ ] 实现进度事件发送逻辑
- [ ] 添加错误处理和清理逻辑

## 阶段 3：UI 组件实现

### 3.1 创建对话框组件

**文件**: `src/renderer/components/DependencyInstallProgressDialog.tsx`

- [ ] 实现基础对话框结构（使用 shadcn/ui Dialog）
- [ ] 添加日志显示区域
- [ ] 添加进度指示器
- [ ] 添加命令执行状态显示
- [ ] 实现成功/失败状态 UI
- [ ] 添加重试按钮（失败时）

**组件结构**：
```tsx
<Dialog open={isOpen} onOpenChange={handleClose}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
    </DialogHeader>

    {/* 命令执行状态 */}
    <CommandStatus />

    {/* 日志区域 */}
    <LogContainer>
      <LogList />
    </LogContainer>

    {/* 进度条 */}
    <Progress value={progressPercentage} />

    <DialogFooter>
      <Button onClick={handleClose} disabled={isExecuting}>
        {isExecuting ? '安装中...' : '关闭'}
      </Button>
      {showRetry && <Button onClick={handleRetry}>重试</Button>}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 3.2 添加子组件

**文件**: `src/renderer/components/dependency-install-progress/` （新建目录）

- [ ] `CommandStatus.tsx` - 显示当前执行的命令
- [ ] `LogContainer.tsx` - 日志容器，支持自动滚动
- [ ] `LogEntry.tsx` - 单条日志条目，支持颜色区分

### 3.3 样式实现

**文件**: `src/renderer/components/dependency-install-progress/index.css`

- [ ] 定义日志容器样式（固定高度，可滚动）
- [ ] 定义不同级别日志的颜色样式
- [ ] 定义动画效果

## 阶段 4：集成现有场景

### 4.1 首次使用引导集成

**文件**: `src/main/onboarding-manager.ts`

- [ ] 修改 `installDependencies` 方法使用新的进度对话框 API

**相关文件**:
- `src/renderer/components/onboarding/` (查找相关组件)
- [ ] 替换现有的依赖安装 UI 调用

### 4.2 版本管理页面集成

**文件**: `src/renderer/components/VersionManagementPage.tsx` (或类似文件)

- [ ] 导入新的对话框组件
- [ ] 替换现有的安装按钮点击处理

### 4.3 依赖管理卡片集成

**文件**: `src/renderer/components/DependencyManagementCardUnified.tsx`

- [ ] 导入新的对话框组件
- [ ] 替换现有的修复依赖功能

## 阶段 5：国际化

### 5.1 英文翻译

**文件**: `src/renderer/i18n/locales/en-US/pages.json`

- [ ] 添加 `installProgressDialog` 命名空间：
  ```json
  "installProgressDialog": {
    "title": "Installing Dependencies",
    "executingCommand": "Executing command {{current}} of {{total}}",
    "currentCommand": "Current Command",
    "logs": "Installation Logs",
    "status": {
      "executing": "Installing...",
      "success": "Installation Complete",
      "error": "Installation Failed"
    },
    "buttons": {
      "close": "Close",
      "retry": "Retry"
    }
  }
  ```

### 5.2 中文翻译

**文件**: `src/renderer/i18n/locales/zh-CN/pages.json`

- [ ] 添加对应的中文翻译

## 阶段 6：测试和验证

### 6.1 功能测试

- [ ] 测试单命令安装场景
- [ ] 测试多命令安装场景
- [ ] 测试安装成功场景
- [ ] 测试安装失败场景
- [ ] 测试重试功能
- [ ] 测试取消功能（如实现）

### 6.2 UI/UX 测试

- [ ] 验证对话框在不同屏幕尺寸下的显示
- [ ] 验证日志自动滚动功能
- [ ] 验证进度动画流畅性
- [ ] 验证错误信息清晰可读

### 6.3 集成测试

- [ ] 在首次使用引导流程中测试
- [ ] 在版本管理页面中测试
- [ ] 在依赖管理卡片中测试

### 6.4 兼容性测试

- [ ] Windows 平台测试
- [ ] macOS 平台测试
- [ ] Linux 平台测试

## 阶段 7：文档和清理

### 7.1 代码文档

- [ ] 为新组件添加 JSDoc 注释
- [ ] 为新添加的 IPC 通道添加注释
- [ ] 更新相关文件的头部注释

### 7.2 清理

- [ ] 移除调试代码
- [ ] 移除未使用的导入
- [ ] 确保 ESLint 检查通过
- [ ] 确保 TypeScript 编译无错误

## 任务依赖关系

```
阶段 1 (基础架构)
    ↓
阶段 2 (主进程实现)
    ↓
阶段 3 (UI 组件实现) ← 阶段 1 必须完成
    ↓
阶段 4 (集成现有场景) ← 阶段 2, 3 必须完成
    ↓
阶段 5 (国际化) ← 可与阶段 3, 4 并行
    ↓
阶段 6 (测试和验证) ← 所有前置阶段必须完成
    ↓
阶段 7 (文档和清理)
```

## 预估工作量

| 阶段 | 预估时间 |
|------|----------|
| 阶段 1：基础架构 | 2-3 小时 |
| 阶段 2：主进程实现 | 3-4 小时 |
| 阶段 3：UI 组件实现 | 4-5 小时 |
| 阶段 4：集成现有场景 | 2-3 小时 |
| 阶段 5：国际化 | 1 小时 |
| 阶段 6：测试和验证 | 3-4 小时 |
| 阶段 7：文档和清理 | 1-2 小时 |
| **总计** | **16-22 小时** |
