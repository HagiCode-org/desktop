# 实施任务清单

## Phase 1: 版本到渠道映射逻辑

### 1.1 实现版本解析和渠道提取
**文件**: `nukeBuild/Adapters/AzureBlobAdapter.cs`

**需求**:
- 新增 `ExtractChannelFromVersion(string version)` 方法
- 从版本字符串（如 "0.1.0-beta.11"）提取渠道标识
- 支持常见渠道命名：beta、stable、canary、alpha、dev
- 返回默认渠道（如 "beta"）当无法识别时

**实现示例**:
```csharp
private string ExtractChannelFromVersion(string version)
{
    if (string.IsNullOrWhiteSpace(version))
        return "beta";

    // Check for common channel patterns
    if (version.Contains("-stable.") || version.Contains("-stable"))
        return "stable";
    if (version.Contains("-beta.") || version.Contains("-beta"))
        return "beta";
    if (version.Contains("-canary.") || version.Contains("-canary"))
        return "canary";
    if (version.Contains("-alpha.") || version.Contains("-alpha"))
        return "alpha";
    if (version.Contains("-dev.") || version.Contains("-dev"))
        return "dev";

    // Default to beta for versions without explicit channel
    return "beta";
}
```

**验收标准**:
- [ ] "0.1.0-beta.11" → "beta"
- [ ] "1.0.0-stable" → "stable"
- [ ] "0.1.0-canary.5" → "canary"
- [ ] "2.0.0" → "beta" (默认)

### 1.2 实现渠道分组方法
**文件**: `nukeBuild/Adapters/AzureBlobAdapter.cs`

**需求**:
- 新增 `GroupVersionsByChannel(List<VersionGroup> versions)` 方法
- 输入版本列表，输出按渠道分组的字典
- 每个渠道组包含版本标识符列表

**验收标准**:
- [ ] 正确分组不同渠道的版本
- [ ] 处理空版本列表
- [ ] 保持原始版本字符串格式

## Phase 2: channels 对象生成

### 2.1 扩展 GenerateIndexFromBlobsAsync
**文件**: `nukeBuild/Adapters/AzureBlobAdapter.cs`

**需求**:
- 在现有 indexData 对象中添加 `channels` 字段
- 调用版本到渠道映射方法
- 为每个渠道构建包含 `latest` 和 `versions` 的对象

**实现位置**:
```csharp
// 在现有版本列表生成后添加
var channelsData = BuildChannelsObject(versionList);

var indexData = new
{
    updatedAt = DateTime.UtcNow.ToString("o"),
    versions = versionList,
    channels = channelsData  // 新增
};
```

**验收标准**:
- [ ] indexJSON 包含 `channels` 对象
- [ ] 每个渠道有 `latest` 和 `versions` 字段
- [ ] `latest` 指向该渠道最新版本

### 2.2 实现渠道最新版本选择
**文件**: `nukeBuild/Adapters/AzureBlobAdapter.cs`

**需求**:
- 新增 `BuildChannelsObject(List<VersionGroup> versions)` 方法
- 对每个渠道的版本进行语义化排序
- 选择最高版本作为 `latest`

**实现要点**:
- 使用 SemverExtensions.cs 中的扩展方法
- 处理版本字符串中的预发布标识符（如 -beta.11）
- 正确比较不同预发布版本

**验收标准**:
- [ ] "0.1.0-beta.11" > "0.1.0-beta.10"
- [ ] "1.0.0" > "0.9.9"
- [ ] 每个渠道的 `latest` 正确

## Phase 3: Nuke 配置集成

### 3.1 利用现有 ReleaseChannel 参数
**文件**: `nukeBuild/Build.cs`

**需求**:
- 确认现有 `ReleaseChannel` 参数（已存在，第59行）
- 在 GenerateIndexFromBlobsAsync 中使用此参数
- 支持通过命令行指定渠道

**验收标准**:
- [ ] `--release-channel beta` 正常工作
- [ ] `--release-channel stable` 正常工作
- [ ] 默认值为 "beta"

### 3.2 添加可选的渠道映射配置
**文件**: `nukeBuild/Build.cs`

**需求**:
- 添加 `ChannelMapping` 参数（可选）
- 支持自定义版本到渠道的映射规则
- JSON 格式配置

**参数示例**:
```csharp
[Parameter("Custom channel mapping (JSON)")]
readonly string ChannelMapping = "";
```

**验收标准**:
- [ ] 支持自定义映射配置
- [ ] 无配置时使用默认规则
- [ ] JSON 解析错误时回退到默认行为

## Phase 4: 验证与测试

### 4.1 单元测试
**文件**: 新建测试项目或使用现有测试

**需求**:
- 测试版本到渠道提取逻辑
- 测试渠道分组功能
- 测试最新版本选择
- 测试边界情况（空版本、无效版本等）

**验收标准**:
- [ ] 所有版本解析测试通过
- [ ] 渠道分组测试通过
- [ ] 最新版本选择测试通过
- [ ] 边界情况测试覆盖

### 4.2 集成测试

**需求**:
- 运行完整的 `GenerateAzureIndex` target
- 验证生成的 indexJSON 格式
- 与 azure-index.json 参考格式对比

**验收标准**:
- [ ] 生成的 indexJSON 包含 channels 字段
- [ ] channels 对象结构与参考一致
- [ ] versions 数组保持原有格式
- [ ] 向后兼容性验证通过

### 4.3 手动验证清单
- [ ] 运行 `./build.sh generate-azure-index`
- [ ] 检查生成的 `artifacts/azure-index.json`
- [ ] 验证 channels.beta.latest 指向正确版本
- [ ] 验证 channels.beta.versions 包含所有 beta 版本
- [ ] 使用不同渠道参数测试

## Phase 5: 文档与部署

### 5.1 更新构建文档

**需求**:
- 记录渠道参数使用方法
- 提供版本命名约定
- 更新 CI/CD 配置说明

**验收标准**:
- [ ] README.md 包含渠道配置说明
- [ ] CI/CD 文档更新
- [ ] 版本命名规范文档

## 优先级

1. **高优先级**: Phase 1 和 Phase 2（核心功能）
2. **中优先级**: Phase 3（配置优化）
3. **低优先级**: Phase 4 和 Phase 5（测试和文档）

## 依赖关系

- Phase 2 依赖 Phase 1（需要先有映射逻辑）
- Phase 3 可与 Phase 2 并行（配置独立）
- Phase 4 依赖 Phase 2 完成（需要功能就绪）

## 预期时间线

- Phase 1: 1-2 天
- Phase 2: 2-3 天
- Phase 3: 1-2 天
- Phase 4: 2-3 天
- Phase 5: 1 天

**总计**: 约 7-11 工作日
