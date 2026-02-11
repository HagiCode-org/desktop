# Change: 使用标准化启动脚本启动Web服务

## Overview

将 Hagicode Desktop 的 Web 服务启动方式从硬编码的 `dotnet` 命令改为执行部署包中的标准化启动脚本（`start.bat`/`start.sh`）。此变更将启动逻辑的职责从应用程序代码转移到部署包，提升系统的灵活性和可扩展性。

## Background

### 当前实现

Hagicode Desktop 当前使用固定的 `dotnet` 命令启动各平台的 Web 服务：

- **启动方式**: 直接使用 `dotnet` 命令启动 .NET Web 服务
- **命令固化**: `web-service-manager.ts:141-148` 中 `getSpawnCommand()` 固定返回 `{ command: 'dotnet', args: [dllPath, ...args] }`
- **平台处理**: 通过条件判断处理 Windows、macOS、Linux 平台差异
- **依赖路径**: 假设部署包结构为 `lib/PCode.Web.dll`

### 现有实现的问题

| 问题 | 描述 | 影响 |
|------|------|------|
| **缺乏灵活性** | 启动命令与部署包内容紧密耦合 | 无法适应部署包启动脚本的变更 |
| **维护成本高** | 启动方式调整需修改应用程序代码 | 每次部署包结构变更都需要发布新版本 |
| **扩展性受限** | 无法支持不同版本或来源的部署包使用不同启动方式 | 限制了多版本管理能力 |
| **责任边界不清** | 启动逻辑应该由部署包自身决定 | 应用程序承担了不应由其负责的职责 |

## What Changes

### 核心变更

1. **标准化启动脚本约定**
   - Windows: 使用 `start.bat` 作为启动入口
   - macOS/Linux: 使用 `start.sh` 作为启动入口

2. **启动逻辑重构**
   - `getSpawnCommand()` 方法改为返回启动脚本路径而非 `dotnet` 命令
   - `getExecutablePath()` 方法改为 `getStartupScriptPath()`
   - 移除对 DLL 路径的直接依赖

3. **向后兼容处理**
   - 当标准化启动脚本不存在时，回退到原有的 `dotnet` 命令方式
   - 添加日志记录以区分使用的是脚本还是直接命令

### 代码变更

| 文件 | 变更类型 | 具体变更 |
|------|----------|----------|
| `src/main/web-service-manager.ts` | MODIFIED | 重构 `getSpawnCommand()`, 修改 `getExecutablePath()` 为 `getStartupScriptPath()` |

## Code Flow Changes

### 当前启动流程

```mermaid
flowchart TD
    A[start] --> B[getExecutablePath]
    B --> C[getSpawnCommand<br/>returns {command: 'dotnet', args: [dllPath]}]
    C --> D[spawn dotnet dllPath]
    D --> E[waitForPortListening]
    E --> F[performHealthCheck]
    F --> G[running]

    style C fill:#f9f,stroke:#333,stroke-width:2px
```

### 新启动流程

```mermaid
flowchart TD
    A[start] --> B[getStartupScriptPath]
    B --> C{script exists?}
    C -->|Yes| D[getSpawnCommand<br/>returns {command: scriptPath}]
    C -->|No| E[fallback to dotnet<br/>returns {command: 'dotnet', args: [dllPath]}]
    D --> F[spawn script]
    E --> G[spawn dotnet dllPath]
    F --> H[waitForPortListening]
    G --> H
    H --> I[performHealthCheck]
    I --> J[running]

    style C fill:#ff9,stroke:#333,stroke-width:2px
    style D fill:#9f9,stroke:#333,stroke-width:2px
    style E fill:#f99,stroke:#333,stroke-width:2px
```

## Impact

### 预期收益

| 收益 | 描述 |
|------|------|
| **解耦启动逻辑** | 应用程序不再依赖特定的 `dotnet` 命令格式 |
| **支持多样化启动** | 部署包可自定义启动方式（如直接执行二进制文件、使用容器等） |
| **降低维护成本** | 启动方式变更只需更新部署包，无需修改应用程序代码 |
| **提升可扩展性** | 为未来支持不同类型的 Web 服务（如非 .NET 服务）奠定基础 |

### Affected Specs

- `specs/electron-app/spec.md` - 修改 Web 服务启动相关需求

### Affected Code

- `src/main/web-service-manager.ts:85-148` - 启动命令和参数获取逻辑

### 风险评估

| 风险 | 缓解措施 |
|------|----------|
| **向后兼容性** | 提供降级方案，脚本不存在时回退到 `dotnet` 命令 |
| **跨平台一致性** | 验证 `start.sh` 和 `start.bat` 在各平台上的正确执行 |
| **调试复杂度** | 添加详细日志，记录使用的是脚本还是直接命令 |
| **部署包变更** | 需要确保新部署包包含标准化启动脚本 |

## Non-Goals

此变更明确**不包括**：

- 修改现有的进程监控和状态管理逻辑
- 改变 Web 服务运行时配置管理方式
- 修改健康检查或端口监听检测机制
- 更改部署包结构或文件组织方式

## Success Criteria

1. **脚本优先**: 当 `start.bat`/`start.sh` 存在时，优先使用脚本启动
2. **向后兼容**: 脚本不存在时，自动回退到 `dotnet` 命令方式
3. **跨平台一致**: Windows 使用 `start.bat`，Unix 系统使用 `start.sh`
4. **功能完整**: 启动后的所有功能（健康检查、状态管理）保持不变
5. **日志清晰**: 日志中明确记录使用的启动方式

## Migration Plan

### 部署包变更

部署包需要添加以下文件：

```
[deployment-package]/
├── start.bat    # Windows 启动脚本（新增）
├── start.sh     # Unix 启动脚本（新增）
└── lib/
    └── PCode.Web.dll
```

### 示例启动脚本

**start.bat** (Windows):
```batch
@echo off
cd /d "%~dp0lib"
dotnet PCode.Web.dll
```

**start.sh** (Unix):
```bash
#!/bin/bash
cd "$(dirname "$0")/lib"
dotnet PCode.Web.dll
```

## Dependencies

### Internal Dependencies

- `electron-log` - 用于记录启动方式选择的日志
- `child_process.spawn` - 用于执行启动脚本

### External Dependencies

- 无新增外部依赖

## References

- 当前实现: `src/main/web-service-manager.ts:85-148`
- OpenSpec 指南: `openspec/AGENTS.md`
