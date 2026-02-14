# Change: 修复依赖检查结果文件路径读取问题

## Why

EntryPoint 脚本执行时将 `Result.json` 文件写入脚本所在目录，而非项目安装目录（工作目录）下的 `Scripts` 文件夹。这导致 `DependencyManager.readResultFile()` 无法正确读取结果文件，进而导致依赖检查功能失败，所有依赖被错误标记为未安装状态。

## What Changes

- **MODIFIED** `DependencyManager.readResultFile()` 方法：增加多路径搜索策略
  - 首先在当前工作目录搜索
  - 如果未找到，在 `Scripts` 子目录中搜索
  - 如果仍未找到，在脚本所在目录搜索（通过脚本路径推断）
  - 保持向后兼容性

- **MODIFIED** `DependencyManager.executeEntryPointScript()` 方法：增强脚本执行路径日志
  - 添加更详细的日志输出，帮助诊断路径问题
  - 记录脚本路径、工作目录和结果文件搜索路径

## Code Flow Changes

```mermaid
flowchart TD
    A[executeEntryPointScript] --> B[设置工作目录为安装目录]
    B --> C[执行脚本]
    C --> D[脚本写入 Result.json]
    D --> E{Result.json 在哪里?}
    E --> F[情况1: 脚本所在目录]
    E --> G[情况2: 工作目录/Scripts]
    E --> H[情况3: 工作目录]
    F --> I[readResultFile 调用]
    G --> I
    H --> I
    I --> J[路径1: 工作目录]
    J -->|未找到| K[路径2: 工作目录/Scripts]
    K -->|未找到| L[路径3: 脚本所在目录推断]
    L -->|未找到| M[返回 null]
    L -->|找到| N[返回 ResultSessionFile]
```

## Impact

- Affected specs: `dependency-management`
- Affected code: `src/main/dependency-manager.ts:93-122` (readResultFile), `dependency-manager.ts:231-379` (executeEntryPointScript)
