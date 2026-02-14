## Context

在 Hagicode Desktop 的依赖管理和安装检查流程中，EntryPoint 脚本（如 `check`、`install`）执行后会生成 `Result.json` 文件来记录执行结果。

**当前问题：**
- `DependencyManager.readResultFile()` 仅在工作目录搜索结果文件
- 实际上脚本可能将结果文件写入：
  1. 脚本所在目录（当前问题）
  2. 工作目录/Scripts 子目录
  3. 工作目录（预期位置）

**约束条件：**
- 需要保持向后兼容性
- 需要支持 Windows、macOS、Linux 跨平台
- 不能修改现有脚本的行为（脚本数量众多）

## Goals / Non-Goals

**Goals:**
- 修复结果文件读取失败的问题
- 实现多路径搜索策略，支持多种脚本行为
- 保持向后兼容性
- 提供详细的日志输出便于诊断

**Non-Goals:**
- 不修改 EntryPoint 脚本本身
- 不改变脚本执行的工作目录设置
- 不引入新的配置选项

## Decisions

### Decision 1: 多路径搜索策略

**选择：** 实现三级路径搜索策略

**搜索顺序：**
1. **工作目录**（`workingDirectory`）- 预期位置，保持原有行为
2. **Scripts 子目录**（`workingDirectory/Scripts`）- 常见的脚本组织方式
3. **脚本所在目录**（从 `scriptPath` 推断）- 当前问题的根源

**理由：**
- 优先使用预期位置，保持原有行为
- 搜索顺序从最可能到最不可能
- 向后兼容，不影响现有正常工作的场景

**Alternatives considered:**
1. **仅修改脚本工作目录设置**
   - 缺点：需要修改所有 EntryPoint 脚本，工作量巨大
   - 缺点：无法控制第三方脚本的行为

2. **使用配置文件指定结果文件路径**
   - 缺点：增加复杂度，需要修改 manifest 格式
   - 缺点：配置错误时难以诊断

3. **统一所有脚本将结果写入工作目录**
   - 缺点：需要大规模修改现有脚本
   - 缺点：无法保证第三方脚本遵循规范

### Decision 2: 方法签名修改

**选择：** 修改 `readResultFile()` 方法签名，添加可选的 `scriptPath` 参数

**Before:**
```typescript
private async readResultFile(workingDirectory: string): Promise<ResultSessionFile | null>
```

**After:**
```typescript
private async readResultFile(workingDirectory: string, scriptPath?: string): Promise<ResultSessionFile | null>
```

**理由：**
- 可选参数保持向后兼容
- 仅在需要时才搜索脚本目录
- 最小化方法签名变更

## Technical Design

### 架构概览

```mermaid
graph TD
    subgraph "DependencyManager"
        A[executeEntryPointScript] --> B[readResultFile]
        C[checkFromManifest] --> B
        B --> D[多路径搜索]
    end

    subgraph "搜索路径"
        D --> E[路径1: workingDirectory]
        D --> F[路径2: workingDirectory/Scripts]
        D --> G[路径3: dirname(scriptPath)]
    end

    subgraph "结果"
        E --> H{找到?}
        F --> I{找到?}
        G --> J{找到?}
        H -->|是| K[返回 ResultSessionFile]
        I -->|是| K
        J -->|是| K
        H -->|否| F
        I -->|否| G
        J -->|否| L[返回 null]
    end
```

### 实现细节

**多路径搜索算法：**

```typescript
private async readResultFile(
  workingDirectory: string,
  scriptPath?: string
): Promise<ResultSessionFile | null> {
  const resultFileNames = ['result.json', 'check-result.json', 'install-result.json'];

  // 定义搜索路径列表
  const searchPaths = [workingDirectory];

  // 添加 Scripts 子目录
  const scriptsDir = path.join(workingDirectory, 'Scripts');
  searchPaths.push(scriptsDir);

  // 添加脚本所在目录
  if (scriptPath) {
    const scriptDir = path.dirname(scriptPath);
    if (scriptDir !== workingDirectory && scriptDir !== scriptsDir) {
      searchPaths.push(scriptDir);
    }
  }

  // 遍历所有搜索路径和文件名组合
  for (const searchPath of searchPaths) {
    for (const fileName of resultFileNames) {
      const resultPath = path.join(searchPath, fileName);
      try {
        log.info('[DependencyManager] Reading result file:', resultPath);
        const content = await fs.readFile(resultPath, 'utf-8');
        const rawData = JSON.parse(content);
        const result = this.normalizeResultFile(rawData, fileName);
        log.info('[DependencyManager] Result file read successfully from:', resultPath);
        return result;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue; // 文件不存在，继续尝试
        }
        log.error('[DependencyManager] Failed to read', resultPath, ':', error);
      }
    }
  }

  log.warn('[DependencyManager] No result file found in any search path');
  return null;
}
```

### 增强的日志输出

**执行前日志：**
```
[DependencyManager] Executing entryPoint script: /path/to/script.sh
[DependencyManager] Working directory: /install/dir
[DependencyManager] Search paths: /install/dir, /install/dir/Scripts, /path/to
```

**搜索过程日志：**
```
[DependencyManager] Reading result file: /install/dir/check-result.json
[DependencyManager] Reading result file: /install/dir/Scripts/check-result.json
[DependencyManager] Reading result file: /path/to/check-result.json
[DependencyManager] Result file read successfully from: /path/to/check-result.json
```

## Risks / Trade-offs

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 多路径搜索增加执行时间 | 低 | 文件不存在时快速失败（ENOENT） |
| 路径推断错误导致找到错误文件 | 低 | 保持优先级顺序，优先预期位置 |
| Windows/macOS/Linux 路径分隔符差异 | 中 | 使用 `path` 模块处理路径拼接 |
| 脚本目录与工作目录相同导致重复搜索 | 低 | 去重逻辑避免重复搜索 |

### 权衡考虑

1. **性能 vs 可靠性**
   - 选择：增加多路径搜索可能轻微影响性能
   - 理由：可靠性优先，文件不存在时快速失败

2. **复杂度 vs 灵活性**
   - 选择：增加少量代码复杂度
   - 理由：支持多种脚本行为，无需修改脚本

## Migration Plan

### 实施步骤

1. **阶段 1：修改 `readResultFile()` 方法**
   - 添加 `scriptPath` 可选参数
   - 实现多路径搜索逻辑
   - 添加增强日志

2. **阶段 2：更新调用点**
   - 修改 `executeEntryPointScript()` 传递脚本路径
   - 更新 `checkFromManifest()` 传递脚本路径

3. **阶段 3：测试验证**
   - 单元测试各种路径场景
   - 集成测试依赖检查和安装功能
   - 跨平台验证

### 回滚计划

- 保留原有 `readResultFile()` 的单一路径搜索逻辑作为注释
- 如果多路径搜索导致问题，可快速回滚到原有实现

## Open Questions

- 无未决问题
