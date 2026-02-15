# indexJSON 生成添加 channel 支持

## 概述

为 HagiCode Desktop 的 Nuke 构建系统添加 channel（发布渠道）支持，使其在生成 indexJSON 时能够包含 `channels` 字段，用于区分不同发布渠道（如 beta、stable、canary）的版本。

## 背景

当前 HagiCode Desktop 项目的 Nuke 构建系统在生成 indexJSON 时不支持 channel 功能。参考文件 `/home/newbe36524/repos/newbe36524/pcode/artifacts/azure-index.json` 展示了支持 channel 的数据结构。

**重要**：此提案关注的是**生成** indexJSON 的构建系统，而非**读取** indexJSON 的应用逻辑（后者已实现）。

## 问题

### 当前实现分析

**GenerateIndexOnlyAsync** (AzureBlobAdapter.cs:108-143):
- 生成简单的 index 结构，只有 `version`、`channel`、`createdAt`、`files`
- `channel` 字段是单个字符串值，不是对象结构
- 无法支持多渠道版本管理

**GenerateIndexFromBlobsAsync** (AzureBlobAdapter.cs:278-361):
- 从 Azure Blob Storage 列出所有文件
- 按版本前缀分组（如 "0.1.0-beta.11"）
- 生成 `versions` 数组，包含版本和文件信息
- **缺少** `channels` 对象结构

### 期望的数据结构

```json
{
  "updatedAt": "2026-02-15T05:45:05.2931068Z",
  "versions": [
    {
      "version": "0.1.0-beta.11",
      "files": ["hagicode-0.1.0-beta.11-linux-x64-nort.zip", ...],
      "assets": [...]
    }
  ],
  "channels": {
    "beta": {
      "latest": "0.1.0-beta.11",
      "versions": ["0.1.0-beta.11", "0.1.0-beta.10", ...]
    },
    "stable": {
      "latest": "1.0.0",
      "versions": ["1.0.0", "0.9.0", ...]
    }
  }
}
```

## 解决方案

### 核心策略

1. **版本到渠道映射**：根据版本字符串确定渠道（如 beta、stable、canary）
2. **channels 对象生成**：为每个渠道创建包含 latest 和 versions 的对象
3. **构建配置扩展**：在 Nuke 配置中添加渠道定义和映射规则

### 实现要点

1. **版本解析逻辑**：
   - 从版本字符串（如 "0.1.0-beta.11"）提取渠道标识
   - 支持常见的渠道命名约定：beta、stable、canary、alpha、dev
   - 允许自定义渠道映射规则

2. **channels 对象构建**：
   - 按渠道分组所有版本
   - 为每个渠道选择 latest 版本（基于语义化版本排序）
   - 生成 versions 数组（包含该渠道所有版本）

3. **Nuke 配置参数**：
   - 利用现有的 `ReleaseChannel` 参数（Build.cs:59）
   - 添加可选的渠道映射配置
   - 支持多渠道同时生成

4. **向后兼容性**：
   - 保持现有 index 结构（updatedAt、versions）
   - channels 字段为可选添加
   - 确保旧版本客户端仍能正常工作

## 影响范围

### 需要修改的文件

- **nukeBuild/Adapters/AzureBlobAdapter.cs**
  - `GenerateIndexFromBlobsAsync` 方法：添加 channels 对象生成逻辑
  - 新增版本到渠道映射方法
  - 新增渠道对象构建方法

- **nukeBuild/Build.cs**
  - 使用现有的 `ReleaseChannel` 参数
  - 可能需要添加渠道配置相关参数

- **nukeBuild/Build.AzureStorage.cs**
  - 更新日志和验证逻辑以支持 channels

### 不需要修改的文件

- **src/main/package-sources/http-index-source.ts**：已实现 channel 解析
- **src/main/version-manager.ts**：Version 接口已包含 channel 字段
- **src/renderer/** 前端相关文件：使用现有逻辑

## 实施计划

详见 `tasks.md` 文件。

## 成功标准

1. indexJSON 包含正确的 `channels` 对象
2. 每个渠道包含 `latest` 版本和 `versions` 数组
3. 版本到渠道的映射符合预期规则
4. 生成的 indexJSON 与 azure-index.json 参考格式一致
5. 向后兼容性：缺少 channels 时客户端仍能正常工作

## 风险与缓解

### 风险

- 版本命名不一致可能导致渠道分类错误
- 多渠道同时发布时的版本管理复杂度

### 缓解措施

- 提供明确的版本到渠道映射规则
- 支持自定义渠道映射配置
- 充分测试各种版本命名模式
