# Tasks: 用 Nuke 重构 Azure Storage 同步工作流

## 阶段 1: Nuke 构建结构创建

### 1.1 创建 Nuke 目录结构
- [ ] 创建 `nukeBuild/` 目录
- [ ] 创建 `nukeBuild/Build.cs` 主构建脚本
- [ ] 创建 `nukeBuild/Build.AzureStorage.cs` Azure Storage 逻辑文件
- [ ] 创建 `nukeBuild/_build.csproj` Nuke 项目文件

### 1.2 创建启动脚本
- [ ] 创建 `build.sh` (Linux/macOS 启动脚本)
- [ ] 创建 `build.cmd` (Windows 启动脚本)
- [ ] 验证脚本可执行性

**成功标准**: 目录结构创建完成，启动脚本可执行

---

## 阶段 2: Nuke 项目配置

### 2.1 配置 _build.csproj

**文件**: `nukeBuild/_build.csproj`
- [ ] 设置 `TargetFramework` 为 `net10.0` (与 PCode 一致)
- [ ] 添加 Nuke 必需的 NuGet 包：
  - [ ] `Nuke.Common`
  - [ ] `Azure.Storage.Blobs`
  - ] `Azure.Identity`
- [ ] 添加辅助包：
  - [ ] `Semver` (版本解析)
  - [ ] `NJsonSchema` (JSON schema 生成，可选)
- [ ] 配置 `InternalsVisibleTo` 以支持测试
- [ ] 设置 `ImplicitUsings` 为 `true`

### 2.2 配置 Build.cs 主脚本

**文件**: `nukeBuild/Build.cs`
- [ ] 添加必要的 using 语句
- [ ] 定义 `Main()` 方法调用 `Execute<Build>()`
- [ ] 添加 `[ShutdownDotNetAfterServerBuild]` 属性
- [ ] 声明 `partial class Build : NukeBuild`

**成功标准**: 项目配置完成，可编译通过

---

## 阶段 3: 参数定义

### 3.1 定义 Azure Storage 参数

**文件**: `nukeBuild/Build.cs`
- [ ] 添加 `#region Azure Blob Storage Parameters` 区域
- [ ] 定义 `AzureBlobSasUrl` 参数 (string)
- [ ] 定义 `SkipAzureBlobPublish` 参数 (bool, default: false)
- [ ] 定义 `AzureGenerateIndex` 参数 (bool, default: true)
- [ ] 定义 `AzureUploadRetries` 参数 (int, default: 3)
- [ ] 定义 `MinifyIndexJson` 参数 (bool, default: true)
- [ ] 定义 `UploadArtifacts` 参数 (bool, default: true)
- [ ] 定义 `UploadIndex` 参数 (bool, default: true)

### 3.2 定义同步相关参数

**文件**: `nukeBuild/Build.cs`
- [ ] 定义 `ReleaseTag` 参数 (string) - 从环境变量读取
- [ ] 定义 `ReleaseChannel` 参数 (string) - 从环境变量读取
- [ ] 定义 `GitHubToken` 参数 (string) - 从环境变量读取
- [ ] 定义 `FeishuWebhookUrl` 参数 (string) - 从环境变量读取

**成功标准**: 所有参数定义完成，有清晰的文档注释

---

## 阶段 4: Azure Storage 核心功能实现

### 4.1 实现 SAS URL 解析

**文件**: `nukeBuild/Build.AzureStorage.cs`
- [ ] 实现 `ParseSasUrl(string sasUrl)` 方法
- [ ] 提取 account name
- [ ] 提取 container name
- [ ] 提取 SAS token
- [ ] 添加 URL 格式验证
- [ ] 添加异常处理

### 4.2 实现 GitHub Release 下载

**文件**: `nukeBuild/Build.AzureStorage.cs`
- [ ] 实现 `DownloadReleaseAssets(string tag, string destDir)` 方法
- [ ] 使用 GitHub API 获取 release 信息
- [ ] 下载所有 release assets
- [ ] 返回下载的文件列表
- [ ] 添加下载进度日志

### 4.3 实现 Azure Storage 上传

**文件**: `nukeBuild/Build.AzureStorage.cs`
- [ ] 实现 `UploadFilesToAzure(string sasUrl, string[] files, string version)` 方法
- [ ] 创建 `BlobServiceClient` 和 `BlobContainerClient`
- [ ] 实现并发上传（使用 `Parallel.ForEachAsync`）
- [ ] 添加上传进度日志
- [ ] 实现上传失败重试逻辑
- [ ] 验证上传结果

### 4.4 实现 Index JSON 生成和上传

**文件**: `nukeBuild/Build.AzureStorage.cs`
- [ ] 实现 `GenerateAzureIndex(string sasUrl, string currentTag)` 方法
- [ ] 从 Azure Storage 列出所有现有 blobs
- [ ] 按版本和渠道组织数据
- [ ] 计算每个渠道的 latest version
- [ ] 生成 JSON (考虑 minify 选项)
- [ ] 上传 index.json 到 storage root

**成功标准**: 各功能模块独立可测试

---

## 阶段 5: Nuke 目标定义

### 5.1 定义 GenerateAzureIndex 目标

**文件**: `nukeBuild/Build.cs`
- [ ] 定义 `Target GenerateAzureIndex`
- [ ] 添加描述：`"Generate Azure Blob Storage index.json locally"`
- [ ] 实现 `Executes(async () => await ExecuteGenerateAzureIndex())`
- [ ] 添加日志记录
- [ ] 添加异常处理

### 5.2 定义 PublishToAzureBlob 目标

**文件**: `nukeBuild/Build.cs`
- [ ] 定义 `Target PublishToAzureBlob`
- [ ] 添加描述：`"Upload pre-generated index.json to Azure Blob Storage"`
- [ ] 设置依赖：`.DependsOn(GenerateAzureIndex)`
- [ ] 实现 `Executes(async () => await ExecutePublishToAzureBlob())`
- [ ] 添加日志记录
- [ ] 添加异常处理

### 5.3 定义 SyncToAzure 目标

**文件**: `nukeBuild/Build.cs`
- [ ] 定义 `Target SyncToAzure`
- [ ] 添加描述：`"Complete sync workflow: download release, upload to Azure, generate index"`
- [ ] 实现 `Executes(async () => await ExecuteSyncToAzure())`
- [ ] 添加日志记录
- [ ] 添加异常处理

**成功标准**: 所有 Nuke 目标可通过命令行调用

---

## 阶段 6: 飞书通知实现

### 6.1 实现飞书通知

**文件**: `nukeBuild/Build.AzureStorage.cs`
- [ ] 实现 `SendFeishuNotification(FeishuNotificationOptions options)` 方法
- [ ] 格式化成功消息
- [ ] 格式化失败消息
- [ ] 发送 HTTP POST 请求到 webhook
- [ ] 处理网络错误和重试

### 6.2 集成通知到目标

**文件**: `nukeBuild/Build.cs`
- [ ] 在 `SyncToAzure` 目标成功时调用通知
- [ ] 在 `SyncToAzure` 目标失败时调用通知
- [ ] 使用 `try-finally` 确保通知发送

**成功标准**: 通知在成功和失败场景下都能正确发送

---

## 阶段 7: 本地测试

### 7.1 准备测试环境
- [ ] 创建测试用的 Azure Storage SAS token (具有写权限)
- [ ] 准备一个测试用的 GitHub Release (或使用 mock 数据)
- [ ] 创建本地测试目录

### 7.2 执行本地测试
- [ ] 运行 `./build.sh --target GenerateAzureIndex` 并传入测试参数
- [ ] 验证 index.json 正确生成
- [ ] 运行 `./build.sh --target SyncToAzure` 完整测试
- [ ] 验证文件正确上传到 Azure Storage
- [ ] 验证 index.json 正确生成和上传
- [ ] 测试错误场景：
  - [ ] 无效的 SAS URL
  - [ ] 无效的 release tag
  - [ ] 网络错误情况
- [ ] 修复发现的问题

**成功标准**: 本地测试完整通过，所有文件正确上传

---

## 阶段 8: 更新 GitHub Actions 工作流

### 8.1 备份和简化工作流
- [ ] 备份现有 `sync-azure-storage.yml` 到 `sync-azure-storage.yml.bak`
- [ ] 重写 `sync-azure-storage.yml`，简化为：
  1. Checkout 代码
  2. Setup .NET SDK
  3. 运行 Nuke SyncToAzure 目标
- [ ] 确保所有必需的 secrets 正确传递给脚本
- [ ] 保持与原工作流相同的触发条件

### 8.2 验证 build.yml 调用
- [ ] 验证 `build.yml` 中对 `sync-azure-storage.yml` 的调用
- [ ] 确保参数传递正确
- [ ] 检查依赖关系

**成功标准**: 工作流文件格式正确，无语法错误

---

## 阶段 9: CI/CD 环境验证

### 9.1 创建测试 Release
- [ ] 创建一个新的测试 tag (如 `v0.1.0-beta-test`)
- [ ] 推送 tag 触发 build 工作流
- [ ] 验证 build 成功完成

### 9.2 验证 Azure 同步
- [ ] 等待 Azure 同步工作流完成
- [ ] 检查 Azure Storage 中是否正确上传文件
- [ ] 验证 index.json 正确生成
- [ ] 验证飞书通知正确发送
- [ ] 检查工作流日志确认无错误

### 9.3 测试失败场景
- [ ] 使用无效的 SAS URL 验证错误处理
- [ ] 验证失败时的飞书通知内容

**成功标准**: CI 环境中完整流程运行成功

---

## 阶段 10: 文档和清理

### 10.1 更新项目文档
- [ ] 在 README 或相关文档中记录新的同步流程
- [ ] 添加本地测试同步的说明
- [ ] 记录环境变量配置要求
- [ ] 添加 Nuke 目标使用说明

### 10.2 代码清理和优化
- [ ] 移除调试用的 console 输出
- [ ] 添加必要的代码注释
- [ ] 确认 C# 编译无警告
- [ ] 运行代码格式化工具

### 10.3 清理备份文件
- [ ] 确认新流程稳定后，删除 `.bak` 备份文件
- [ ] 清理测试文件和数据

**成功标准**: 代码整洁，文档完整

---

## 任务总览

| 阶段 | 任务数 | 预计工作量 |
|------|--------|----------|
| 阶段 1: Nuke 构建结构创建 | 6 | 低 |
| 阶段 2: Nuke 项目配置 | 10 | 中 |
| 阶段 3: 参数定义 | 10 | 低 |
| 阶段 4: Azure Storage 核心功能实现 | 18 | 高 |
| 阶段 5: Nuke 目标定义 | 12 | 中 |
| 阶段 6: 飞书通知实现 | 8 | 中 |
| 阶段 7: 本地测试 | 9 | 中 |
| 阶段 8: 更新 GitHub Actions 工作流 | 5 | 低 |
| 阶段 9: CI/CD 环境验证 | 9 | 高 |
| 阶段 10: 文档和清理 | 9 | 低 |
| **总计** | **96** | **高** |

## 并行执行建议

以下任务可以并行开发：
- 阶段 2 中各配置项可并行进行
- 阶段 4 中各功能模块可并行实现
- 文档编写可与代码开发并行

以下任务必须顺序执行：
- 阶段 5 必须在阶段 3 和 4 完成后
- 阶段 7 必须在阶段 6 完成后
- 阶段 9 必须在阶段 8 完成后

## PCode 项目参考

**PCode 项目路径**: `/home/newbe36524/repos/newbe36524/pcode/nukeBuild/`

可参考以下文件：
- `Build.cs:45-67` - Azure Blob Storage 参数定义
- `Build.cs:160-180` - Azure 相关目标定义
- `_build.csproj:24-25` - Azure SDK 依赖包
