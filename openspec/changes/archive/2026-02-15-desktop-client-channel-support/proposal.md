# Desktop客户端多渠道版本支持

## 概述

为 Hagicode Desktop 客户端添加多渠道版本支持能力，使客户端能够解析和处理从 `server.dl.hagicode.com` 返回的 `channels` 对象结构，支持区分 stable、beta、alpha 等不同发布渠道的版本。

## 背景

### 系统现状
- **Server 端**：`server.dl.hagicode.com` 的 index 接口返回包含顶层 `channels` 对象的 JSON 结构
- **Desktop 客户端**：当前使用 `HttpIndexSource` 获取版本信息，但未实现对 channels 的识别和处理

### 核心问题
Desktop 客户端目前将所有版本视为单一渠道，导致：
1. 无法区分不同渠道的版本（stable、beta、alpha）
2. 无法按用户选择的渠道过滤版本列表
3. 缺少渠道选择和配置的 UI 能力

## 解决方案

### 设计原则
1. **向后兼容**：当服务器未返回 `channels` 对象时，将所有版本默认为 `beta` 渠道
2. **渐进增强**：第一阶段实现基础解析，后续迭代添加 UI 渠道选择
3. **最小变更**：保持现有架构不变，仅扩展必要的数据模型和处理逻辑

### 实际 API 结构

根据 `/home/newbe36524/repos/newbe36524/pcode/artifacts/azure-index.json`，服务器返回的实际结构如下：

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
    }
  }
}
```

### 核心变更

#### 1. 数据模型扩展

```typescript
// src/main/package-sources/http-index-source.ts
// 扩展 HttpIndexFile 接口
interface HttpIndexFile {
  updatedAt: string;
  versions: HttpIndexVersion[];
  channels?: Record<string, ChannelInfo>;  // 新增：渠道信息对象
}

// 新增：渠道信息接口
interface ChannelInfo {
  latest: string;
  versions: string[];
}

// 扩展 HttpIndexVersion 接口
interface HttpIndexVersion {
  version: string;
  files?: string[];
  assets: HttpIndexAsset[];
}

// src/main/version-manager.ts
// 扩展 Version 接口
interface Version {
  id: string;
  version: string;
  channel?: string;  // 新增：从 channels 结构映射而来
  platform: string;
  packageFilename: string;
  releasedAt?: string;
  size?: number;
  downloadUrl?: string;
  releaseNotes?: string;
}
```

#### 2. HttpIndexSource 增强

**变更内容**：
- 解析 index.json 时提取顶层 `channels` 对象
- 基于 `channels` 结构为每个版本映射其所属渠道
- 当 `channels` 对象不存在时，将所有版本默认为 `beta` 渠道
- 支持可选的 channel 过滤参数

**渠道映射逻辑**：
```typescript
// 当 channels 对象存在时，遍历每个渠道的 versions 数组
// 为版本对象添加对应的 channel 属性
if (indexFile.channels) {
  for (const [channelName, channelInfo] of Object.entries(indexFile.channels)) {
    for (const versionStr of channelInfo.versions) {
      const version = versions.find(v => v.version === versionStr);
      if (version) {
        version.channel = channelName;
      }
    }
  }
} else {
  // 向后兼容：未指定渠道时，所有版本默认为 beta
  versions.forEach(v => v.channel = 'beta');
}
```

#### 3. 包源配置扩展

**变更内容**：
```typescript
// src/main/package-source-config-manager.ts
interface StoredPackageSourceConfig {
  type: 'local-folder' | 'github-release' | 'http-index';
  id: string;
  name?: string;
  createdAt: string;
  lastUsedAt?: string;
  defaultChannel?: string;  // 新增：默认渠道
  // ... 其他字段
}
```

#### 4. 版本管理器更新

**变更内容**：
- 修改 `getVersions()` 方法支持可选的 `channel` 参数
- 实现基于 channel 的版本过滤逻辑
- 支持获取特定渠道的 latest 版本

#### 5. UI 组件更新（第二阶段）

**变更内容**：
- 在 `VersionManagementPage.tsx` 添加渠道选择器
- 在版本列表中显示渠道标签
- 更新 Redux slice 以支持渠道选择状态

### 实现阶段

#### 第一阶段：基础支持（必需）
- [ ] 扩展数据模型添加 `channels` 和 `ChannelInfo` 接口
- [ ] `HttpIndexSource` 解析 `channels` 对象并映射版本渠道
- [ ] 实现向后兼容：未返回 channels 时默认为 beta
- [ ] 版本列表携带 channel 信息

#### 第二阶段：UI 支持（后续）
- [ ] 包源配置添加 `defaultChannel` 字段
- [ ] 版本管理页面添加渠道选择器
- [ ] 版本列表显示渠道标签

## 范围

### 包含内容
1. `HttpIndexFile` 接口扩展（添加 `channels` 字段）
2. 新增 `ChannelInfo` 接口定义
3. `Version` 接口扩展（添加 `channel` 字段）
4. `HttpIndexSource` 的 channels 解析和版本映射逻辑
5. 向后兼容处理（无 channels 对象时）
6. 基础的 channel 过滤能力（内部）

### 不包含内容
1. 多渠道并行展示 UI
2. 渠道切换的持久化存储
3. 渠道订阅或自动更新策略
4. 非渠道相关的版本管理功能变更

## 影响

### 技术影响

**文件变更**：
| 文件 | 变更类型 | 描述 |
|------|----------|------|
| `src/main/package-sources/http-index-source.ts` | 修改 | 添加 channels 解析和版本映射逻辑 |
| `src/main/version-manager.ts` | 修改 | 扩展 Version 接口，添加 channel 参数支持 |
| `src/main/package-source-config-manager.ts` | 修改 | 添加 defaultChannel 配置字段（第二阶段） |
| `src/renderer/components/VersionManagementPage.tsx` | 修改 | 添加渠道选择器（第二阶段） |

**IPC 接口**：
- 现有 `version:list` 保持不变，返回的 Version 对象将包含 `channel` 字段
- 可能需要新增 `version:setChannel` IPC（第二阶段）

**数据兼容性**：
- 与现有 index.json 格式完全向后兼容
- 服务器未返回 channels 时自动使用默认值

### 用户体验影响

**第一阶段**：
- 用户无感知变化
- 默认使用 `beta` 渠道的版本列表

**第二阶段**：
- 用户可在包源配置中选择默认渠道
- 版本列表中显示渠道标识
- 支持渠道切换

### 业务价值
1. 与 Server 站点的实际 API 结构保持同步
2. 正确解析渠道信息，为版本管理提供准确数据
3. 为未来提供 stable、beta、alpha 多版本选择奠定基础
4. 提升版本管理的灵活性和可维护性

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 服务器 channels 结构变更 | 高 | 实现健壮的解析逻辑，channels 不存在时使用默认值 |
| 版本在 channels.versions 中不存在 | 中 | 容错处理，未映射版本的 channel 为 undefined |
| 旧版本客户端不兼容 | 低 | 新增字段为可选，旧客户端忽略 |
| 版本过滤逻辑错误 | 中 | 充分测试各种 channels 组合场景 |
| UI 性能影响 | 低 | 渠道过滤在主进程完成，前端仅展示 |

## 依赖关系

### 外部依赖
- `server.dl.hagicode.com/index.json` 必须正确返回 `channels` 对象结构

### 内部依赖
- 现有的 `HttpIndexSource` 和 `VersionManager` 实现稳定

## 测试策略

### 单元测试
1. `HttpIndexSource` 的 channels 对象解析逻辑
2. 版本到渠道的映射逻辑
3. 向后兼容：无 channels 对象时的默认值处理
4. 边界情况：空 channels、版本不存在于任何渠道

### 集成测试
1. 完整的版本获取流程
2. 基于渠道的版本列表展示
3. 渠道切换功能

### 测试数据
基于实际的 azure-index.json 结构：

```json
{
  "updatedAt": "2026-02-15T05:45:05.2931068Z",
  "versions": [
    {
      "version": "0.1.0-beta.11",
      "files": ["hagicode-0.1.0-beta.11-linux-x64-nort.zip"],
      "assets": [...]
    },
    {
      "version": "1.0.0",
      "files": ["hagicode-1.0.0-linux-x64-nort.zip"],
      "assets": [...]
    }
  ],
  "channels": {
    "beta": {
      "latest": "0.1.0-beta.11",
      "versions": ["0.1.0-beta.11", "0.1.0-beta.10"]
    },
    "stable": {
      "latest": "1.0.0",
      "versions": ["1.0.0"]
    }
  }
}
```

**无 channels 对象的向后兼容测试**：
```json
{
  "updatedAt": "2026-02-15T05:45:05.2931068Z",
  "versions": [
    {
      "version": "0.1.0",
      "files": ["hagicode-0.1.0-linux-x64-nort.zip"],
      "assets": [...]
    }
  ]
  // 无 channels 对象
}
```

## 成功标准

1. ✅ Desktop 客户端能正确解析服务器返回的 `channels` 对象
2. ✅ 每个版本正确映射到其所属渠道
3. ✅ 未指定 channels 时所有版本默认为 `beta`
4. ✅ 版本列表中每个版本都包含正确的 `channel` 信息
5. ✅ 向后兼容：服务器不返回 channels 时客户端正常工作
6. ✅ 所有现有功能不受影响

## 时间表

- **第一阶段**：预计 1-2 个工作日
- **第二阶段**：待第一阶段完成后评估

## 参考资料

- Server 端 API 示例：`/home/newbe36524/repos/newbe36524/pcode/artifacts/azure-index.json`
- 现有 HttpIndexSource 实现：`src/main/package-sources/http-index-source.ts`
- 版本管理器实现：`src/main/version-manager.ts`
