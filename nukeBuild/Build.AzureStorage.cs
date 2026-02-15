using Adapters;
using System.Text.RegularExpressions;

public partial class Build
{
    /// <summary>
    /// 步骤 1: 生成 Azure index.json
    /// 仅生成索引文件并保存到本地，不执行上传
    /// 用于 CI/CD 场景中独立管理 index.json
    /// </summary>
    private async Task ExecuteGenerateAzureIndex()
    {
        Log.Information("=== 生成 Azure Index ===");

        // 验证 SAS URL 配置
        if (string.IsNullOrWhiteSpace(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 未配置");
            Log.Error("请设置 --azure-blob-sas-url 参数");
            Log.Error("或设置 AZURE_BLOB_SAS_URL 环境变量");
            throw new Exception("必须配置 Azure Blob SAS URL");
        }

        // 创建 Azure Blob 适配器
        var adapter = new AzureBlobAdapter(RootDirectory);

        // 验证 SAS URL
        Log.Information("验证 SAS URL...");
        if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 验证失败");
            Log.Error("请检查:");
            Log.Error("  1. SAS URL 格式是否正确");
            Log.Error("  2. SAS Token 是否包含 Write 权限");
            Log.Error("  3. SAS Token 是否已过期");
            throw new Exception("Azure Blob SAS URL 验证失败");
        }

        // 确定输出路径
        var outputPath = !string.IsNullOrWhiteSpace(AzureIndexOutputPath)
            ? AzureIndexOutputPath
            : (RootDirectory / "artifacts" / "azure-index.json").ToString();

        Log.Information("Index 输出路径: {Path}", outputPath);

        // 配置发布选项
        var options = new AzureBlobPublishOptions
        {
            SasUrl = AzureBlobSasUrl,
            UploadRetries = AzureUploadRetries,
            LocalIndexPath = outputPath
        };

        // 根据构建配置决定是否压缩：Release 模式默认压缩，Debug 模式默认不压缩
        // 可通过 MinifyIndexJson 参数覆盖默认行为
        bool shouldMinify = MinifyIndexJson;

        Log.Information("压缩设置: {Minify} (MinifyIndexJson: {MinifyIndexJson})",
            shouldMinify ? "启用" : "禁用", MinifyIndexJson);

        // 生成 index.json
        Log.Information("生成 index.json...");
        var indexJson = await adapter.GenerateIndexOnlyAsync(options, outputPath, shouldMinify);

        if (string.IsNullOrWhiteSpace(indexJson))
        {
            Log.Error("生成 index.json 失败");
            throw new Exception("生成 index.json 失败");
        }

        // 验证生成的文件
        Log.Information("验证 index.json...");
        if (!await adapter.ValidateIndexFileAsync(outputPath))
        {
            Log.Error("index.json 验证失败");
            throw new Exception("index.json 验证失败");
        }

        Log.Information("✅ Azure index.json 已生成");
        Log.Information("   文件路径: {Path}", outputPath);
        Log.Information("   文件大小: {Size} 字节", indexJson.Length);
    }

    /// <summary>
    /// 步骤 2: 上传 index.json 到 Azure Blob Storage
    /// 从本地读取预先生成的 index.json 并上传
    /// 用于 CI/CD 场景中独立管理 index.json
    /// 可选地同时上传 zip 构建产物
    /// </summary>
    private async Task ExecutePublishToAzureBlob()
    {
        Log.Information("=== 上传到 Azure Blob ===");
        Log.Information("上传配置: Artifacts={Artifacts}, Index={Index}",
            UploadArtifacts, UploadIndex);

        // Determine version from ReleaseTag or GitHub
        var versionTag = ReleaseTag;

        if (string.IsNullOrWhiteSpace(versionTag))
        {
            Log.Information("未指定 ReleaseTag，尝试从 GitHub 获取最新 tag...");

            // Try to get GitHub repository from local git remote
            string? repoOwnerAndName = null;
            
            try
            {
                var gitDir = RootDirectory / ".git";
                if (Directory.Exists(gitDir))
                {
                    var configPath = gitDir / "config";
                    if (File.Exists(configPath))
                    {
                        var configContent = await File.ReadAllTextAsync(configPath);
                        // Look for GitHub remote URL
                        var match = Regex.Match(configContent, @"github\.com[/:]([^/]+)/([^/.]+)");
                        if (match.Success)
                        {
                            repoOwnerAndName = $"{match.Groups[1].Value}/{match.Groups[2].Value}";
                            Log.Information("检测到 GitHub 仓库: {Repo}", repoOwnerAndName);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "无法读取 git 配置");
            }

            if (!string.IsNullOrWhiteSpace(GitHubToken) && !string.IsNullOrWhiteSpace(repoOwnerAndName))
            {
                var githubAdapter = new GitHubAdapter(GitHubToken, repoOwnerAndName);
                var latestTag = await githubAdapter.GetLatestReleaseTagAsync();

                if (!string.IsNullOrWhiteSpace(latestTag))
                {
                    versionTag = latestTag;
                    Log.Information("使用 GitHub 最新 tag: {Tag}", versionTag);
                }
                else
                {
                    Log.Warning("无法从 GitHub 获取最新 tag，将使用默认版本");
                    versionTag = BuildConfig.Version;
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(GitHubToken))
                {
                    Log.Warning("未配置 GitHub Token (通过 --github-token 或 GITHUB_TOKEN 环境变量)");
                }
                if (string.IsNullOrWhiteSpace(repoOwnerAndName))
                {
                    Log.Warning("无法确定 GitHub 仓库信息");
                }
                Log.Information("使用默认版本: {Version}", BuildConfig.Version);
                versionTag = BuildConfig.Version;
            }
        }
        else
        {
            Log.Information("使用指定的 ReleaseTag: {Tag}", versionTag);
        }

        // Update BuildConfig version
        BuildConfig.Version = versionTag;

        // 验证至少启用一个上传选项
        if (!UploadArtifacts && !UploadIndex)
        {
            Log.Warning("未启用任何上传选项（--upload-artifacts 和 --upload-index 均为 false）");
            Log.Information("操作已完成，无需上传");
            return;
        }

        // 验证 SAS URL 配置
        if (string.IsNullOrWhiteSpace(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 未配置");
            Log.Error("请设置 --azure-blob-sas-url 参数");
            throw new Exception("必须配置 Azure Blob SAS URL");
        }

        // 创建适配器
        var adapter = new AzureBlobAdapter(RootDirectory);

        // 验证 SAS URL
        Log.Information("验证 SAS URL...");
        if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 验证失败");
            Log.Error("请检查:");
            Log.Error("  1. SAS URL 格式是否正确");
            Log.Error("  2. SAS Token 是否包含 Write 权限");
            Log.Error("  3. SAS Token 是否已过期");
            throw new Exception("Azure Blob SAS URL 验证失败");
        }

        // 步骤 1: 可选的产物上传
        if (UploadArtifacts)
        {
            Log.Information("=== 步骤 1: 上传构建产物 ===");

            // 收集构建产物
            var artifactPaths = new List<string>();
            var packagesDirectory = BuildConfig.ReleasePackagedDirectory;

            if (!Directory.Exists(packagesDirectory))
            {
                Log.Warning("打包目录不存在: {Path}", packagesDirectory);
                Log.Warning("跳过产物上传");
            }
            else
            {
                var packageFiles = packagesDirectory.GlobFiles("*.zip");
                if (!packageFiles.Any())
                {
                    Log.Warning("在打包目录中未找到 .zip 文件: {Path}", packagesDirectory);
                    Log.Warning("跳过产物上传");
                }
                else
                {
                    foreach (var packageFile in packageFiles)
                    {
                        artifactPaths.Add(packageFile);
                        Log.Information("添加构建产物: {File}", packageFile.Name);
                    }

                    Log.Information("共 {Count} 个构建产物待上传", artifactPaths.Count);

                    // 配置发布选项
                    var artifactOptions = new AzureBlobPublishOptions
                    {
                        SasUrl = AzureBlobSasUrl,
                        UploadRetries = AzureUploadRetries,
                        VersionPrefix = BuildConfig.Version
                    };

                    // 上传构建产物
                    var result = await adapter.UploadArtifactsAsync(artifactPaths, artifactOptions);

                    if (!result.Success)
                    {
                        Log.Error("Azure Blob 产物上传失败: {Error}", result.ErrorMessage);
                        throw new Exception($"Azure Blob 产物上传失败: {result.ErrorMessage}");
                    }

                    Log.Information("✅ 构建产物已上传");
                    Log.Information("  上传文件数: {Count}", result.UploadedBlobs.Count);

                    if (result.Warnings.Any())
                    {
                        Log.Warning("警告:");
                        foreach (var warning in result.Warnings)
                        {
                            Log.Warning("  - {Warning}", warning);
                        }
                    }
                }
            }
        }
        else
        {
            Log.Information("跳过产物上传（--upload-artifacts 未启用）");
        }

        // 步骤 2: 可选的 index.json 上传
        if (UploadIndex)
        {
            Log.Information("=== 步骤 2: 上传 index.json ===");

            // 确定要上传的 index 文件路径
            var localIndexPath = !string.IsNullOrWhiteSpace(AzureIndexOutputPath)
                ? AzureIndexOutputPath
                : (RootDirectory / "artifacts" / "azure-index.json").ToString();

            Log.Information("本地 index 路径: {Path}", localIndexPath);

            // 检查文件是否存在
            if (!File.Exists(localIndexPath))
            {
                Log.Error("本地 index 文件不存在: {Path}", localIndexPath);
                Log.Error("请先运行 GenerateAzureIndex 目标生成 index.json");
                throw new Exception($"本地 index 文件不存在: {localIndexPath}");
            }

            // 配置发布选项
            var options = new AzureBlobPublishOptions
            {
                SasUrl = AzureBlobSasUrl,
                UploadRetries = AzureUploadRetries
            };

            // 上传 index.json
            Log.Information("上传 index.json 到 Azure Blob Storage...");
            var success = await adapter.UploadIndexOnlyAsync(options, localIndexPath);

            if (!success)
            {
                Log.Error("上传 index.json 失败");
                throw new Exception("上传 index.json 失败");
            }

            Log.Information("✅ index.json 已成功上传到 Azure Blob Storage");
        }
        else
        {
            Log.Information("跳过 index 上传（--upload-index 未启用）");
        }

        // 完成日志
        Log.Information("=== 上传完成 ===");
        Log.Information("  产物上传: {ArtifactsStatus}", UploadArtifacts ? "已执行" : "已跳过");
        Log.Information("  Index 上传: {IndexStatus}", UploadIndex ? "已执行" : "已跳过");
    }
}
