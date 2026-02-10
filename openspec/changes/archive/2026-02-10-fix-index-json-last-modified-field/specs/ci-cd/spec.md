# ci-cd Specification Delta

## MODIFIED Requirements

### Requirement: Azure Storage 同步工作流

项目 MUST 在发布标签创建后自动将发布资源同步到 Azure Storage，并在同步完成后发送飞书通知。生成的 index.json 文件 MUST 包含每个版本资源的完整元数据，包括文件名、路径、大小和最后修改时间。

#### Scenario: 发布标签触发 Azure 同步

**Given** 创建新的版本标签（如 `v1.0.0`）
**When** 标签推送到仓库且构建完成
**Then** 自动触发 `.github/workflows/sync-azure-storage.yml` 工作流
**And** 下载发布资源到临时目录
**And** 上传资源到 Azure Storage 对应版本目录
**And** 生成并上传 index.json 文件，其中每个 asset 都包含有效的 `lastModified` 字段
**And** 发送同步结果通知到飞书

#### Scenario: index.json 包含完整元数据

**Given** Azure Storage 同步工作流生成 index.json
**When** 从 Azure Storage 获取 Blob 列表并构建索引
**Then** 每个版本的 assets 数组中每个元素包含以下字段：
  - `name`: 文件名
  - `path`: 存储路径
  - `size`: 文件大小（字节）
  - `lastModified`: 最后修改时间（ISO 8601 格式）
**And** `lastModified` 字段值优先来自 Azure Blob 的 `lastModified` 属性
**And** 如果 Azure Blob 的 `lastModified` 为空或不可用，使用 GitHub Release 的 `published_at` 时间作为后备值
**And** 时间戳格式为 ISO 8601 标准（例如：`2024-02-10T12:34:56.789Z`）

#### Scenario: lastModified 后备方案

**Given** Azure Storage 同步工作流生成 index.json
**When** Azure Blob 的 `lastModified` 属性为空或不可用
**Then** 从 GitHub Release API 获取对应版本的 `published_at` 时间
**And** 使用 `published_at` 时间作为 `lastModified` 字段的值
**And** 确保时间格式统一为 ISO 8601 标准

#### Scenario: index.json 验证

**Given** index.json 生成完成
**When** 运行 `jq empty index.json` 验证 JSON 格式
**Then** JSON 格式验证通过
**And** 所有版本和资源数据完整
**And** 文件上传到 Azure Storage 根目录
