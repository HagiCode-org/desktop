using Adapters;

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
    /// 步骤 2: 同步 GitHub Release 到 Azure Blob Storage
    /// 完整的同步流程：下载 release 资产 -> 上传到 Azure -> 生成 index.json
    /// </summary>
    private async Task ExecutePublishToAzureBlob()
    {
        Log.Information("=== 同步 GitHub Release 到 Azure Blob ===");
        Log.Information("上传配置: Artifacts={Artifacts}, Index={Index}",
            UploadArtifacts, UploadIndex);

        // Determine version from ReleaseTag or GitHub
        var versionTag = ReleaseTag;

        if (string.IsNullOrWhiteSpace(versionTag))
        {
            Log.Information("未指定 ReleaseTag，尝试从 GitHub 获取最新 tag...");
            
            // 使用 gh CLI 获取 latest tag
            var latestTag = await GetLatestReleaseTagUsingGhAsync();
            
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

        // 步骤 1: 下载 GitHub Release 资产
        var downloadDirectory = RootDirectory / "artifacts" / "release-assets";
        var downloadedFiles = new List<string>();

        Log.Information("=== 步骤 1: 下载 GitHub Release 资产 ===");
        Log.Information("Release Tag: {Tag}", versionTag);
        Log.Information("下载目录: {Path}", downloadDirectory);

        // 使用 gh CLI 下载 release 资产
        Log.Information("使用 gh CLI 下载 release 资产...");
        var downloadSuccess = await DownloadReleaseAssetsUsingGhAsync(versionTag, downloadDirectory);

        if (downloadSuccess > 0)
        {
            Log.Information("成功下载 {Count} 个资源", downloadSuccess);
        }
        else if (downloadSuccess == 0)
        {
            Log.Warning("未找到 release 资产");
            Log.Warning("Tag: {Tag}", versionTag);
        }
        else
        {
            Log.Error("下载失败");
        }

        // 步骤 2: 上传到 Azure Blob Storage
        if (UploadArtifacts && downloadedFiles.Count > 0)
        {
            Log.Information("=== 步骤 2: 上传到 Azure Blob ===");

            var adapter = new AzureBlobAdapter(RootDirectory);

            // 验证 SAS URL
            Log.Information("验证 SAS URL...");
            if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
            {
                Log.Error("Azure Blob SAS URL 验证失败");
                throw new Exception("Azure Blob SAS URL 验证失败");
            }

            // 配置发布选项
            var uploadOptions = new AzureBlobPublishOptions
            {
                SasUrl = AzureBlobSasUrl,
                UploadRetries = AzureUploadRetries,
                VersionPrefix = versionTag
            };

            // 上传文件
            var result = await adapter.UploadArtifactsAsync(downloadedFiles, uploadOptions);

            if (!result.Success)
            {
                Log.Error("Azure Blob 产物上传失败: {Error}", result.ErrorMessage);
                throw new Exception($"Azure Blob 产物上传失败: {result.ErrorMessage}");
            }

            Log.Information("✅ 构建产物已上传");
            Log.Information("  上传文件数: {Count}", result.UploadedBlobs.Count);
        }
        else
        {
            Log.Information("跳过产物上传");
        }

        // 步骤 3: 生成并上传 index.json
        if (UploadIndex)
        {
            Log.Information("=== 步骤 3: 生成并上传 index.json ===");

            var adapter = new AzureBlobAdapter(RootDirectory);

            // 验证 SAS URL
            if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
            {
                Log.Error("Azure Blob SAS URL 验证失败");
                throw new Exception("Azure Blob SAS URL 验证失败");
            }

            // 配置发布选项
            var indexOptions = new AzureBlobPublishOptions
            {
                SasUrl = AzureBlobSasUrl,
                UploadRetries = AzureUploadRetries
            };

            var localIndexPath = (RootDirectory / "artifacts" / "azure-index.json").ToString();

            // 从 Azure blobs 生成 index.json
            Log.Information("从 Azure blobs 生成 index.json...");
            var indexJson = await adapter.GenerateIndexFromBlobsAsync(indexOptions, localIndexPath, MinifyIndexJson);

            if (string.IsNullOrWhiteSpace(indexJson))
            {
                Log.Error("生成 index.json 失败");
                throw new Exception("生成 index.json 失败");
            }

            // 上传 index.json
            Log.Information("上传 index.json 到 Azure Blob Storage...");
            var success = await adapter.UploadIndexJsonAsync(indexOptions, indexJson);

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
        Log.Information("=== 同步完成 ===");
        Log.Information("  Release Tag: {Tag}", versionTag);
        Log.Information("  下载资源: {DownloadCount}", downloadedFiles.Count);
        Log.Information("  产物上传: {ArtifactsStatus}", UploadArtifacts ? "已执行" : "已跳过");
        Log.Information("  Index 上传: {IndexStatus}", UploadIndex ? "已执行" : "已跳过");
    }

    private async Task<string?> GetLatestReleaseTagUsingGhAsync()
    {
        try
        {
            Log.Information("使用 gh CLI 获取最新 release tag...");

            var psi = new ProcessStartInfo
            {
                FileName = "gh",
                Arguments = "release view --json tagName -q .tagName",
                RedirectStandardOutput = true,
                UseShellExecute = true,
                CreateNoWindow = true
            };

            using var process = new System.Diagnostics.Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true
            };

            process.Start();
            await process.WaitForExitAsync();

            var output = await process.StandardOutput.ReadToEndAsync();
            var error = await process.StandardError.ReadToEndAsync();

            if (process.ExitCode != 0)
            {
                Log.Error("gh CLI 失败，退出码: {Code}", process.ExitCode);
                if (!string.IsNullOrWhiteSpace(error))
                {
                    Log.Error("错误输出: {Error}", error);
                }
                return null;
            }

            var tag = output.Trim();
            if (string.IsNullOrWhiteSpace(tag))
            {
                Log.Warning("gh CLI 未返回 tag 信息");
                return null;
            }

            Log.Information("GitHub 最新 release tag: {Tag}", tag);
            return tag;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "使用 gh CLI 获取 tag 失败");
            return null;
        }
    }

    private async Task DownloadReleaseAssetsUsingGhAsync(string tag, AbsolutePath downloadDirectory)
    {
        try
        {
            // 确保下载目录存在
            if (!Directory.Exists(downloadDirectory))
            {
                Directory.CreateDirectory(downloadDirectory);
            }

            Log.Information("使用 gh CLI 下载 release 资产: {Tag}", tag);

            var psi = new ProcessStartInfo
            {
                FileName = "gh",
                Arguments = $"release download {tag} --dir {downloadDirectory} --pattern \"*\"",
                RedirectStandardOutput = true,
                UseShellExecute = true,
                CreateNoWindow = true
            };

            using var process = new System.Diagnostics.Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true
            };

            process.Start();

            // 等待进程完成
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                Log.Error("gh CLI 下载失败，退出码: {Code}", process.ExitCode);
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "gh CLI 下载失败");
        }
    }
}
