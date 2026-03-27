using Adapters;
using AzureStorage;
using System.Diagnostics;

public partial class Build
{
    private async Task ExecuteGenerateAzureIndex()
    {
        Log.Information("=== 生成 Azure Index ===");

        if (string.IsNullOrWhiteSpace(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 未配置");
            Log.Error("请设置 --azure-blob-sas-url 参数");
            throw new Exception("必须配置 Azure Blob SAS URL");
        }

        var adapter = new AzureBlobAdapter(RootDirectory);
        if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 验证失败");
            throw new Exception("Azure Blob SAS URL 验证失败");
        }

        var outputPath = !string.IsNullOrWhiteSpace(AzureIndexOutputPath)
            ? AzureIndexOutputPath
            : (RootDirectory / "artifacts" / "azure-index.json").ToString();

        var options = new AzureBlobPublishOptions
        {
            SasUrl = AzureBlobSasUrl,
            UploadRetries = AzureUploadRetries,
            LocalIndexPath = outputPath,
        };

        Log.Information("压缩设置: {Minify} (MinifyIndexJson: {MinifyIndexJson})",
            MinifyIndexJson ? "启用" : "禁用", MinifyIndexJson);

        var indexJson = await adapter.GenerateIndexOnlyAsync(options, outputPath, MinifyIndexJson);
        if (string.IsNullOrWhiteSpace(indexJson))
        {
            Log.Error("生成 index.json 失败");
            throw new Exception("生成 index.json 失败");
        }

        if (!await adapter.ValidateIndexFileAsync(outputPath))
        {
            Log.Error("index.json validation failed");
            throw new Exception("index.json 验证失败");
        }

        Log.Information("✅ Azure index.json 已生成");
        Log.Information("   文件路径: {Path}", outputPath);
        Log.Information("   文件大小: {Size} 字节", indexJson.Length);
    }

    private async Task ExecutePublishToAzureBlob()
    {
        Log.Information("=== 同步 GitHub Release 到 Azure Blob ===");
        Log.Information("上传配置: Artifacts={Artifacts}, Index={Index}", UploadArtifacts, UploadIndex);

        var versionTag = ReleaseTag;
        if (string.IsNullOrWhiteSpace(versionTag))
        {
            Log.Information("未指定 ReleaseTag，尝试从 GitHub 获取最新 tag...");
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

        BuildConfig.Version = versionTag;

        if (!UploadArtifacts && !UploadIndex)
        {
            Log.Warning("未启用任何上传选项（--upload-artifacts 和 --upload-index 均为 false）");
            Log.Information("操作已完成，无需上传");
            return;
        }

        if (string.IsNullOrWhiteSpace(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 未配置");
            throw new Exception("必须配置 Azure Blob SAS URL");
        }

        if (string.IsNullOrWhiteSpace(EffectiveGitHubToken))
        {
            Log.Error("GitHub Token 未配置");
            Log.Error("配置方式:");
            Log.Error("  CI/CD: 工作流中设置 GITHUB_TOKEN 环境变量 (通过 EnableGitHubToken=true 自动注入)");
            Log.Error("  本地: 使用 --github-token 参数");
            Log.Error("所需权限: contents: read (访问 Releases)");
            Log.Error("参考: hagicode-release 项目");
            throw new Exception("必须配置 GitHub Token");
        }

        var downloadDirectory = RootDirectory / "artifacts" / "release-assets";
        var downloadedFiles = new List<string>();

        Log.Information("=== 步骤 1: 下载 GitHub Release 资产 ===");
        Log.Information("Release Tag: {Tag}", versionTag);
        Log.Information("下载目录: {Path}", downloadDirectory);
        Log.Information("使用 gh CLI 下载 release 资产...");

        await DownloadReleaseAssetsUsingGhAsync(versionTag, downloadDirectory);
        downloadedFiles = Directory.GetFiles(downloadDirectory)
            .Where((path) => !File.GetAttributes(path).HasFlag(FileAttributes.Directory))
            .ToList();

        if (downloadedFiles.Count > 0)
        {
            Log.Information("成功下载 {Count} 个资源", downloadedFiles.Count);
        }
        else
        {
            Log.Warning("未找到 release 资产");
            Log.Warning("Tag: {Tag}", versionTag);
        }

        var adapter = new AzureBlobAdapter(RootDirectory, ChannelMapping);
        if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 验证失败");
            throw new Exception("Azure Blob SAS URL 验证失败");
        }

        var publishOptions = new AzureBlobPublishOptions
        {
            SasUrl = AzureBlobSasUrl,
            UploadRetries = AzureUploadRetries,
            VersionPrefix = versionTag,
        };
        var localIndexPath = (RootDirectory / "artifacts" / "azure-index.json").ToString();

        ReleasePublishSummary? publishSummary = null;
        var indexHandled = false;

        if (UploadArtifacts && downloadedFiles.Count > 0)
        {
            Log.Information("=== 步骤 2: 生成 sidecar 并上传 Azure Blob ===");
            var orchestrator = new AzureReleasePublishOrchestrator(new ArtifactHybridMetadataBuilder(), adapter);
            publishSummary = await orchestrator.PublishAsync(
                downloadedFiles,
                publishOptions,
                localIndexPath,
                UploadIndex,
                MinifyIndexJson);

            ReportPublishSummary(publishSummary);

            if (!publishSummary.Success)
            {
                var stageCode = ResolveFailureStageCode(publishSummary.Diagnostics);
                throw new Exception($"[{stageCode}] {publishSummary.ErrorMessage}");
            }

            Log.Information("✅ 构建产物已上传");
            Log.Information("  原始资产数: {Count}", publishSummary.PublishedArtifacts.Count);
            Log.Information("  sidecar 成功数: {Count}", publishSummary.SidecarSuccessCount);
            Log.Information("  HTTP-only 回退数: {Count}", publishSummary.HttpOnlyFallbackCount);
            indexHandled = UploadIndex && publishSummary.IndexUploaded;
        }
        else if (UploadArtifacts)
        {
            Log.Information("跳过产物上传，当前没有可上传的 release 资产");
        }

        if (UploadIndex && !indexHandled)
        {
            Log.Information("=== 步骤 3: 生成并上传 index.json ===");
            var indexResult = await adapter.GenerateIndexFromBlobsWithMetadataAsync(
                publishOptions,
                localIndexPath,
                publishSummary is not null ? publishSummary.PublishedArtifacts : new List<PublishedArtifactMetadata>(),
                MinifyIndexJson);

            ReportIndexDiagnostics(indexResult);

            if (string.IsNullOrWhiteSpace(indexResult.IndexJson))
            {
                throw new Exception("[index-write] 生成 index.json 失败");
            }

            Log.Information("上传 index.json 到 Azure Blob Storage...");
            var success = await adapter.UploadIndexJsonAsync(publishOptions, indexResult.IndexJson);
            if (!success)
            {
                throw new Exception("[index-write] 上传 index.json 失败");
            }

            Log.Information("✅ index.json 已成功上传到 Azure Blob Storage");
        }
        else if (UploadIndex)
        {
            Log.Information("=== 步骤 3: index.json 已在 sidecar 编排后上传 ===");
        }
        else
        {
            Log.Information("跳过 index 上传（--upload-index 未启用）");
        }

        Log.Information("=== 同步完成 ===");
        Log.Information("  Release Tag: {Tag}", versionTag);
        Log.Information("  下载资源: {DownloadCount}", downloadedFiles.Count);
        Log.Information("  产物上传: {ArtifactsStatus}", UploadArtifacts ? "已执行" : "已跳过");
        Log.Information("  Index 上传: {IndexStatus}", UploadIndex ? "已执行" : "已跳过");
        if (publishSummary != null)
        {
            Log.Information("  Eligible 资产: {Count}", publishSummary.EligibleAssetCount);
            Log.Information("  sidecar 成功数: {Count}", publishSummary.SidecarSuccessCount);
            Log.Information("  HTTP-only 回退数: {Count}", publishSummary.HttpOnlyFallbackCount);
        }
    }

    private static void ReportPublishSummary(ReleasePublishSummary summary)
    {
        Log.Information("=== 发布摘要 ===");
        Log.Information("  Eligible 资产数量: {Count}", summary.EligibleAssetCount);
        Log.Information("  sidecar 成功数: {Count}", summary.SidecarSuccessCount);
        Log.Information("  HTTP-only 回退数: {Count}", summary.HttpOnlyFallbackCount);

        if (summary.Diagnostics.Count == 0)
        {
            Log.Information("  失败资产清单: 无");
            return;
        }

        Log.Warning("  失败资产清单 ({Count})：", summary.Diagnostics.Count);
        foreach (var diagnostic in summary.Diagnostics)
        {
            Log.Warning("  - [{Stage}] {Artifact}: {Code} - {Message}",
                ResolveFailureStageCode(diagnostic.Stage),
                diagnostic.ArtifactName,
                diagnostic.Code,
                diagnostic.Message);
        }
    }

    private static void ReportIndexDiagnostics(AzureBlobIndexGenerationResult result)
    {
        Log.Information("=== 索引摘要 ===");
        Log.Information("  版本数: {Count}", result.VersionCount);
        Log.Information("  资产数: {Count}", result.AssetCount);
        Log.Information("  HTTP-only 回退数: {Count}", result.HttpOnlyFallbackCount);

        foreach (var diagnostic in result.Diagnostics)
        {
            Log.Warning("  - [{Stage}] {Artifact}: {Code} - {Message}",
                ResolveFailureStageCode(diagnostic.Stage),
                diagnostic.ArtifactName,
                diagnostic.Code,
                diagnostic.Message);
        }
    }

    private static string ResolveFailureStageCode(IEnumerable<ArtifactPublishDiagnostic> diagnostics)
    {
        return diagnostics
            .Select((diagnostic) => diagnostic.Stage)
            .Where((stage) => stage.HasValue)
            .Select((stage) => ResolveFailureStageCode(stage))
            .LastOrDefault() ?? "publish";
    }

    private static string ResolveFailureStageCode(ArtifactPublishFailureStage? stage)
    {
        return stage switch
        {
            ArtifactPublishFailureStage.MetadataBuild => "metadata-build",
            ArtifactPublishFailureStage.SidecarGeneration => "sidecar-generation",
            ArtifactPublishFailureStage.UploadMissing => "upload-missing",
            ArtifactPublishFailureStage.IndexWrite => "index-write",
            _ => "publish",
        };
    }

    private async Task DownloadReleaseAssetsUsingGhAsync(string tag, AbsolutePath downloadDirectory)
    {
        Directory.CreateDirectory(downloadDirectory);

        var psi = new ProcessStartInfo
        {
            FileName = "gh",
            Arguments = $"release download {tag} --dir \"{downloadDirectory}\" --clobber",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            Environment =
            {
                ["GH_TOKEN"] = EffectiveGitHubToken,
            },
        };

        using var process = new System.Diagnostics.Process
        {
            StartInfo = psi,
            EnableRaisingEvents = true,
        };

        process.Start();
        await process.WaitForExitAsync();

        var stdOut = await process.StandardOutput.ReadToEndAsync();
        var stdErr = await process.StandardError.ReadToEndAsync();

        if (!string.IsNullOrWhiteSpace(stdOut))
        {
          Log.Information(stdOut.Trim());
        }

        if (process.ExitCode != 0)
        {
            if (!string.IsNullOrWhiteSpace(stdErr))
            {
                Log.Error(stdErr.Trim());
            }

            throw new Exception($"gh release download 失败，退出码: {process.ExitCode}");
        }
    }

    /// <summary>
    /// 使用 gh CLI 获取最新 release tag
    /// </summary>
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
                UseShellExecute = false,
                CreateNoWindow = true,
                Environment =
                {
                    ["GH_TOKEN"] = EffectiveGitHubToken,
                },
            };

            using var process = new System.Diagnostics.Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true,
            };

            process.Start();
            await process.WaitForExitAsync();

            var output = await process.StandardOutput.ReadToEndAsync();
            var latestTag = output.Trim();

            if (process.ExitCode == 0 && !string.IsNullOrWhiteSpace(latestTag))
            {
                Log.Information("成功获取最新 release tag: {Tag}", latestTag);
                return latestTag;
            }

            Log.Warning("gh CLI 获取 release tag 失败，退出码: {ExitCode}", process.ExitCode);
            return null;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "获取最新 release tag 时出错");
            return null;
        }
    }
}
