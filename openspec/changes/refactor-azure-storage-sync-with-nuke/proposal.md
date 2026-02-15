# Proposal: 用 Nuke 重构 Azure Storage 同步工作流

## 概述

将当前的 Azure Storage 同步工作流 (`.github/workflows/sync-azure-storage.yml`) 从复杂的 Azure CLI/bash 脚本实现重构为使用 **Nuke** 构建系统的可维护方案。

本提案将参考 `/home/newbe36524/repos/newbe36524/pcode` 项目中已验证的 Nuke + Azure Storage 集成方案。

## 背景

### 当前状态

Hagicode Desktop 项目使用 GitHub Actions 进行 CI/CD 构建，并通过 `sync-azure-storage.yml` 工作流将发布产物同步到 Azure Storage。

当前实现包含：
- 使用 GitHub Actions workflow_call 触发机制
- 通过 Azure CLI (`az storage blob`) 进行文件上传
- 使用复杂的 bash 脚本解析 SAS URL、生成 index.json
- 两个 jobs: `sync-to-azure` 和 `azure-sync-notification`

### 当前实现的问题

1. **复杂的 bash 脚本**：SAS URL 解析、JSON 生成逻辑使用 bash/sed/jq 实现，可读性和可维护性差
2. **调试困难**：bash 脚本在 CI 环境中难以调试，错误处理不完善
3. **与项目技术栈不一致**：项目是 Electron 应用，但同步逻辑使用 bash
4. **不可本地测试**：无法在本地开发环境中轻松测试同步逻辑
5. **代码复用性差**：与项目代码脱节，无法共享类型定义和工具函数

### 参考实现：PCode 项目

**位置**: `/home/newbe36524/repos/newbe36524/pcode/nukeBuild/`

PCode 项目已成功使用 Nuke 实现了 Azure Storage 集成，包含：

1. **Azure Blob Storage 参数定义** (`Build.cs:45-67`):
   - `AzureBlobSasUrl`: Azure Blob SAS URL for authentication and upload
   - `SkipAzureBlobPublish`: Skip Azure Blob publish
   - `AzureGenerateIndex`: Generate Azure index.json
   - `AzureUploadRetries`: Azure upload retries
   - `MinifyIndexJson`: Minify index.json uploaded to Azure

2. **Nuke 目标** (`Build.cs:160-180`):
   - `GenerateAzureIndex`: Generate Azure Blob Storage index.json locally
   - `PublishToAzureBlob`: Upload pre-generated index.json to Azure Blob Storage

3. **依赖包** (`_build.csproj:24-25`):
   - `Azure.Storage.Blobs`: Azure Blob Storage SDK
   - `Azure.Identity`: Azure authentication library

## 提议的变更

### 核心变更

使用 **Nuke** 构建系统替代当前的 bash 实现，具体包括：

1. **创建 Nuke 构建脚本**：在 `nukeBuild/` 目录下创建 `Build.cs` 和 `_build.csproj`
2. **添加 Azure Storage 目标**：参考 PCode 项目实现 `GenerateAzureIndex` 和 `PublishToAzureBlob` 目标
3. **简化工作流**：将 `sync-azure-storage.yml` 重构为调用 Nuke 目标的简化工作流
4. **类型安全**：利用 C# 和 Nuke 提供的类型安全和参数验证
5. **可本地测试**：Nuke 脚本可在本地环境运行测试

### 技术实现

#### 1. 创建 Nuke 构建结构

```
desktop/
├── nukeBuild/
│   ├── Build.cs              # 主构建脚本
│   ├── Build.AzureStorage.cs  # Azure Storage 相关逻辑（参考文件）
│   ├── _build.csproj         # Nuke 项目文件
│   └── build.sh             # Linux/macOS 启动脚本
└── build.cmd                # Windows 启动脚本
```

#### 2. Nuke 参数定义

参考 PCode 项目，定义以下参数：

```csharp
#region Azure Blob Storage Parameters

[Parameter("Azure Blob SAS URL for authentication and upload")]
readonly string AzureBlobSasUrl = "";

[Parameter("Skip Azure Blob publish")]
readonly bool SkipAzureBlobPublish = false;

[Parameter("Generate Azure index.json")]
readonly bool AzureGenerateIndex = true;

[Parameter("Azure upload retries")]
readonly int AzureUploadRetries = 3;

[Parameter("Minify index.json uploaded to Azure (default: true for Release, false for Debug)")]
readonly bool MinifyIndexJson = true;

[Parameter("启用 zip 构建产物上传")]
readonly bool UploadArtifacts = true;

[Parameter("启用 index.json 上传（默认 true）")]
readonly bool UploadIndex = true;

#endregion
```

#### 3. Nuke 目标定义

参考 PCode 项目实现以下目标：

| 目标 | 功能 | 依赖 |
|------|------|------|
| `GenerateAzureIndex` | Generate Azure Blob Storage index.json locally | 无 |
| `PublishToAzureBlob` | Upload pre-generated index.json to Azure Blob Storage | GenerateAzureIndex |
| `SyncToAzure` | Complete sync workflow (download + upload + index) | 无 |

#### 4. 简化的工作流

```yaml
# .github/workflows/sync-azure-storage.yml (重构后)
name: Sync Release to Azure Storage

on:
  workflow_call:
    inputs:
      release_tag:
        description: 'Release tag to sync'
        required: true
        type: string
      release_channel:
        description: 'Release channel (stable, beta, dev)'
        required: false
        type: string
        default: 'beta'
    secrets:
      FEISHU_WEBHOOK_URL:
        required: true
  workflow_dispatch:
    inputs:
      release_tag:
        description: 'Release tag to sync'
        required: false
        type: string
      release_channel:
        description: 'Release channel (stable, beta, dev)'
        required: false
        type: choice
        options: [stable, beta, dev]

permissions:
  contents: read

jobs:
  sync:
    name: Sync Release Assets to Azure Storage
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET SDK
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Run Nuke Sync to Azure
        run: ./build.sh --target SyncToAzure
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          AZURE_BLOB_SAS_URL: ${{ secrets.AZURE_BLOB_SAS_URL }}
          RELEASE_TAG: ${{ inputs.release_tag }}
          RELEASE_CHANNEL: ${{ inputs.release_channel }}
          FEISHU_WEBHOOK_URL: ${{ secrets.FEISHU_WEBHOOK_URL }}
          GITHUB_RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          GITHUB_SHA: ${{ github.sha }}
          GITHUB_ACTOR: ${{ github.actor }}
```

### 受影响的组件

| 组件 | 变更类型 | 描述 |
|------|----------|------|
| `.github/workflows/sync-azure-storage.yml` | 重写 | 简化为调用 Nuke 目标 |
| `nukeBuild/Build.cs` | 新建 | Nuke 主构建脚本 |
| `nukeBuild/Build.AzureStorage.cs` | 新建 | Azure Storage 同步逻辑 |
| `nukeBuild/_build.csproj` | 新建 | Nuke 项目文件 |
| `build.sh` | 新建 | Linux/macOS Nuke 启动脚本 |
| `build.cmd` | 新建 | Windows Nuke 启动脚本 |
| `README.md` 或相关文档 | 更新 | 记录新的同步流程 |

## 预期收益

1. **统一技术栈**：同步逻辑使用 C# 和 Nuke，与 PCode 项目保持一致
2. **更好的可维护性**：C# 提供类型安全，Nuke 提供清晰的构建目标结构
3. **易于测试**：Nuke 脚本可在本地运行和调试，无需每次都推送到 CI
4. **代码复用**：可直接参考和复用 PCode 项目中已验证的实现
5. **更好的错误处理**：使用 C# 异常处理和 Nuke 的日志系统
6. **减少外部依赖**：移除对 Azure CLI 的依赖，仅使用 Azure SDK

## 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 脚本 bug 导致同步失败 | 高 | 充分的本地测试；先在 beta 渠道验证；参考 PCode 已验证代码 |
| Azure SDK API 变更 | 中 | 使用稳定版本；锁定依赖版本 |
| 环境变量配置遗漏 | 中 | 详细的配置文档；运行时验证 |
| 迁移过程中的问题 | 低 | 保留原始工作流文件备份 (`.bak`) |
| .NET SDK 在 CI 中的可用性 | 低 | 使用 `actions/setup-dotnet@v4` 确保可用 |

## 成功标准

1. ✅ 所有现有同步功能正确实现
2. ✅ 本地可以成功运行 Nuke 同步目标（使用测试 SAS token）
3. ✅ CI 环境中成功完成完整同步流程
4. ✅ 生成的 index.json 格式与原有格式兼容
5. ✅ 飞书通知正常发送
6. ✅ 代码通过 C# 编译检查

## 时间线

| 阶段 | 内容 |
|------|------|
| 阶段 1 | 创建 Nuke 构建结构和参数定义 |
| 阶段 2 | 实现 Azure Storage 核心功能 |
| 阶段 3 | 本地测试和调试 |
| 阶段 4 | 更新 GitHub Actions 工作流 |
| 阶段 5 | CI 环境验证 |

## 替代方案

### 方案 A：保持现状
**优点**：无工作量，现有系统可用
**缺点**：维护性差，技术栈不统一

### 方案 B：使用 GitHub Actions 自定义 composite action
**优点**：可复用，封装良好
**缺点**：仍主要使用 YAML，调试困难

### 方案 C：使用 Node.js/TypeScript 脚本
**优点**：与 Electron 应用技术栈一致
**缺点**：无法复用 PCode 项目已验证的 Nuke 实现；需要重新编写所有逻辑

## 参考资料

- **PCode 项目 Nuke 实现**: `/home/newbe36524/repos/newbe36524/pcode/nukeBuild/`
- [Nuke Documentation](https://nuke.build/)
- [Azure Storage Blob SDK for .NET](https://github.com/Azure/azure-sdk-for-net/tree/main/sdk/storage/Azure.Storage.Blobs)
- 当前工作流文件：`.github/workflows/sync-azure-storage.yml`
