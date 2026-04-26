using AzureStorage;
using Utils;

public partial class Build
{
    private async Task ExecuteGenerateAzureUploadPlan()
    {
        Log.Information("=== 生成 Azure Upload Plan ===");
        EnsureGitHubTokenConfigured();

        var releaseTag = await ResolveReleaseTagAsync(requireLookup: true);
        var effectiveVersion = ResolveEffectiveVersion(releaseTag);
        var gitHubAdapter = CreateGitHubAdapter();
        var uploadPlan = await gitHubAdapter.CreateAzureUploadPlanAsync(
            releaseTag,
            effectiveVersion,
            ReleaseChannel,
            AzureMaxParallel);

        var planOutputPath = GetAzureUploadPlanOutputPath();
        var matrixOutputPath = GetAzureUploadMatrixOutputPath();
        var matrixDocument = new
        {
            shard = uploadPlan.Shards.Select((shard) => new
            {
                shard.ShardId,
                shard.AssetCount,
                shard.TotalSizeBytes,
                Assets = shard.Assets,
                AssetName = shard.Assets.Count == 1 ? shard.Assets[0].Name : string.Empty,
                AssetSize = shard.Assets.Count == 1 ? shard.Assets[0].Size : 0L,
            }),
        };

        await WriteJsonAsync(planOutputPath, uploadPlan);
        await WriteJsonAsync(matrixOutputPath, matrixDocument);

        Log.Information("Release tag: {Tag}", releaseTag);
        Log.Information("Version prefix: {Version}", effectiveVersion);
        Log.Information("Eligible assets: {Count}", uploadPlan.EligibleAssets.Count);
        Log.Information("Skipped source archives: {Count}", uploadPlan.SkippedAssets.Count);
        Log.Information("Planned shards: {Count}", uploadPlan.Shards.Count);
        Log.Information("Workflow max parallel: {Count}", uploadPlan.MaxParallel);
        Log.Information("Plan output: {Path}", planOutputPath);
        Log.Information("Matrix output: {Path}", matrixOutputPath);
    }

    private async Task ExecuteGenerateAzureIndex()
    {
        Log.Information("=== 生成 Azure Index ===");
        Log.Information("GitHub repository: {Repository}", EffectiveGitHubRepository);

        EnsureAzureSasConfigured();

        var adapter = CreateAzureBlobAdapter();
        if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 验证失败");
            throw new Exception("Azure Blob SAS URL 验证失败");
        }

        var outputPath = GetAzureIndexOutputPath();
        var mergedSummary = await TryLoadMergedPublishSummaryAsync();
        IReadOnlyCollection<PublishedArtifactMetadata> publishedArtifacts = mergedSummary is not null
            ? mergedSummary.PublishedArtifacts
            : Array.Empty<PublishedArtifactMetadata>();

        var options = CreatePublishOptions(versionPrefix: string.Empty, outputPath);
        Log.Information("压缩设置: {Minify} (MinifyIndexJson: {MinifyIndexJson})",
            MinifyIndexJson ? "启用" : "禁用", MinifyIndexJson);

        var indexResult = await adapter.GenerateIndexFromBlobsWithMetadataAsync(
            options,
            outputPath,
            publishedArtifacts,
            MinifyIndexJson);

        ReportIndexDiagnostics(indexResult);

        if (string.IsNullOrWhiteSpace(indexResult.IndexJson))
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
        Log.Information("   文件大小: {Size} 字节", indexResult.IndexJson.Length);
    }

    private async Task ExecutePublishToAzureBlob()
    {
        Log.Information("=== 同步 GitHub Release 到 Azure Blob ===");
        Log.Information("上传配置: Artifacts={Artifacts}, Index={Index}, Concurrency={Concurrency}",
            UploadArtifacts,
            UploadIndex,
            AzureUploadConcurrency);

        var summary = new ReleasePublishSummary
        {
            ShardId = string.IsNullOrWhiteSpace(PublishShardId) ? "serial" : PublishShardId,
        };

        try
        {
            if (!UploadArtifacts && !UploadIndex)
            {
                Log.Warning("未启用任何上传选项（--upload-artifacts 和 --upload-index 均为 false）");
                summary.Success = true;
                await ExportPublishSummaryAsync(summary);
                return;
            }

            EnsureAzureSasConfigured();

            var releaseTag = UploadArtifacts
                ? await ResolveReleaseTagAsync(requireLookup: true)
                : await ResolveReleaseTagAsync(requireLookup: false);
            var effectiveVersion = ResolveEffectiveVersion(releaseTag);
            var outputPath = GetAzureIndexOutputPath();
            var adapter = CreateAzureBlobAdapter();

            if (!await adapter.ValidateSasUrlAsync(AzureBlobSasUrl))
            {
                throw new Exception("Azure Blob SAS URL 验证失败");
            }

            var publishOptions = CreatePublishOptions(effectiveVersion, outputPath);

            if (UploadArtifacts)
            {
                EnsureGitHubTokenConfigured();

                var selectionManifest = await LoadReleaseAssetSelectionManifestAsync();
                if (selectionManifest is not null && !string.IsNullOrWhiteSpace(selectionManifest.ShardId))
                {
                    summary.ShardId = selectionManifest.ShardId;
                }

                var downloadedFiles = await DownloadSelectedReleaseAssetsAsync(
                    releaseTag,
                    effectiveVersion,
                    selectionManifest);

                if (downloadedFiles.Count > 0)
                {
                    Log.Information("=== 步骤 1: 上传 shard 产物 ===");
                    var orchestrator = new AzureReleasePublishOrchestrator(new ArtifactHybridMetadataBuilder(), adapter);
                    summary = await orchestrator.PublishAsync(
                        downloadedFiles,
                        publishOptions,
                        outputPath,
                        UploadIndex,
                        MinifyIndexJson,
                        EffectiveGitHubRepository);

                    if (string.IsNullOrWhiteSpace(summary.ShardId))
                    {
                        summary.ShardId = selectionManifest?.ShardId ?? PublishShardId ?? "serial";
                    }

                    ReportPublishSummary(summary);
                }
                else
                {
                    Log.Information("当前没有可上传的 release 资产");
                    summary.Success = true;
                }
            }

            if (UploadIndex && !summary.IndexUploaded && (summary.Success || !UploadArtifacts))
            {
                Log.Information("=== 步骤 2: 生成并上传 index.json ===");
                var mergedSummary = await TryLoadMergedPublishSummaryAsync();
                if (mergedSummary is not null)
                {
                    summary = mergedSummary;
                    summary.ShardId = "finalize";
                }

                var indexResult = await adapter.GenerateIndexFromBlobsWithMetadataAsync(
                    publishOptions,
                    outputPath,
                    summary.PublishedArtifacts,
                    MinifyIndexJson);

                summary.Diagnostics.AddRange(indexResult.Diagnostics);
                summary.HttpOnlyFallbackCount = Math.Max(summary.HttpOnlyFallbackCount, indexResult.HttpOnlyFallbackCount);
                ReportIndexDiagnostics(indexResult);

                if (string.IsNullOrWhiteSpace(indexResult.IndexJson))
                {
                    summary.ErrorMessage = "生成 index.json 失败";
                }
                else if (!await adapter.UploadIndexJsonAsync(publishOptions, indexResult.IndexJson))
                {
                    summary.ErrorMessage = "上传 index.json 失败";
                }
                else
                {
                    summary.IndexJson = indexResult.IndexJson;
                    summary.IndexUploaded = true;
                    summary.Success = true;
                }
            }
            else if (!UploadIndex)
            {
                Log.Information("跳过 index 上传（--upload-index 未启用）");
                if (string.IsNullOrWhiteSpace(summary.ErrorMessage))
                {
                    summary.Success = true;
                }
            }

            if (!summary.Success && string.IsNullOrWhiteSpace(summary.ErrorMessage))
            {
                summary.ErrorMessage = "Azure Blob 发布失败";
            }

            LogPublishCompletion(summary, releaseTag, effectiveVersion);
            await ExportPublishSummaryAsync(summary);

            if (!summary.Success)
            {
                var stageCode = ResolveFailureStageCode(summary.Diagnostics);
                throw new Exception($"[{stageCode}] {summary.ErrorMessage}");
            }
        }
        catch (Exception ex)
        {
            if (string.IsNullOrWhiteSpace(summary.ErrorMessage))
            {
                summary.ErrorMessage = ex.Message;
            }

            if (summary.Diagnostics.Count == 0)
            {
                summary.Diagnostics.Add(new ArtifactPublishDiagnostic
                {
                    ArtifactName = UploadIndex ? "index.json" : "publish",
                    Code = "publish-exception",
                    Message = ex.Message,
                    Stage = UploadIndex
                        ? ArtifactPublishFailureStage.IndexWrite
                        : ArtifactPublishFailureStage.UploadMissing,
                });
            }

            await ExportPublishSummaryAsync(summary);
            throw;
        }
    }

    private GitHubAdapter CreateGitHubAdapter()
    {
        return new GitHubAdapter(RootDirectory, EffectiveGitHubToken, EffectiveGitHubRepository);
    }

    private AzureBlobAdapter CreateAzureBlobAdapter()
    {
        return new AzureBlobAdapter(RootDirectory, ChannelMapping, EffectiveGitHubRepository);
    }

    private AzureBlobPublishOptions CreatePublishOptions(string versionPrefix, string outputPath)
    {
        return new AzureBlobPublishOptions
        {
            SasUrl = AzureBlobSasUrl,
            UploadRetries = AzureUploadRetries,
            UploadConcurrency = AzureUploadConcurrency,
            VersionPrefix = versionPrefix,
            PublicBaseUrl = AzurePublicBaseUrl,
            LocalIndexPath = outputPath,
        };
    }

    private async Task<string> ResolveReleaseTagAsync(bool requireLookup)
    {
        if (!string.IsNullOrWhiteSpace(ReleaseTag))
        {
            Log.Information("使用指定的 ReleaseTag: {Tag}", ReleaseTag);
            return ReleaseTag;
        }

        if (!requireLookup && string.IsNullOrWhiteSpace(EffectiveGitHubToken))
        {
            Log.Warning("未指定 ReleaseTag，且当前路径不要求 GitHub 查询");
            return string.Empty;
        }

        EnsureGitHubTokenConfigured();
        Log.Information("未指定 ReleaseTag，尝试从 GitHub 获取最新 tag...");
        var latestTag = await CreateGitHubAdapter().GetLatestReleaseTagUsingGhAsync();
        if (string.IsNullOrWhiteSpace(latestTag))
        {
            throw new Exception("无法从 GitHub 获取最新 release tag");
        }

        return latestTag;
    }

    private string ResolveEffectiveVersion(string releaseTag)
    {
        var seedVersion = !string.IsNullOrWhiteSpace(ReleaseVersion)
            ? ReleaseVersion
            : (!string.IsNullOrWhiteSpace(releaseTag) ? releaseTag : BuildConfig.Version);
        var effectiveVersion = NormalizePublishedVersionPrefix(seedVersion);
        BuildConfig.Version = effectiveVersion;
        BuildConfig.ReleaseChannel = ReleaseChannel;
        return effectiveVersion;
    }

    private async Task<IReadOnlyList<string>> DownloadSelectedReleaseAssetsAsync(
        string releaseTag,
        string effectiveVersion,
        ReleaseAssetSelectionManifest? selectionManifest)
    {
        var downloadDirectory = RootDirectory / "artifacts" / "release-assets" /
            (string.IsNullOrWhiteSpace(selectionManifest?.ShardId) ? "serial" : selectionManifest.ShardId);

        if (Directory.Exists(downloadDirectory))
        {
            Directory.Delete(downloadDirectory, recursive: true);
        }

        Directory.CreateDirectory(downloadDirectory);

        var selectedAssetNames = selectionManifest?.Assets
            .Select((asset) => asset.Name)
            .Where((name) => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        Log.Information("=== 下载 GitHub Release 资产 ===");
        Log.Information("Release Tag: {Tag}", releaseTag);
        Log.Information("下载目录: {Path}", downloadDirectory);

        await CreateGitHubAdapter().DownloadReleaseAssetsAsync(releaseTag, downloadDirectory, selectedAssetNames);

        var allDownloadedFiles = Directory.GetFiles(downloadDirectory)
            .Where((path) => !File.GetAttributes(path).HasFlag(FileAttributes.Directory))
            .ToList();

        var filteredFiles = FilterAzureEligibleReleaseAssets(allDownloadedFiles, releaseTag, effectiveVersion);
        var filteredAssetCount = allDownloadedFiles.Count - filteredFiles.Count;
        if (filteredAssetCount > 0)
        {
            Log.Information("已过滤 {Count} 个 GitHub 自动生成源码包资产", filteredAssetCount);
        }

        Log.Information("成功准备 {Count} 个可上传资产", filteredFiles.Count);
        return filteredFiles;
    }

    private List<string> FilterAzureEligibleReleaseAssets(
        IEnumerable<string> filePaths,
        string releaseTag,
        string effectiveVersion)
    {
        var repositoryName = BuildConfig.ResolveGitHubReleaseRepositoryName(EffectiveGitHubRepository);
        return filePaths
            .Where((path) => !AzureBlobPathUtilities.IsGitHubGeneratedSourceArchive(
                Path.GetFileName(path),
                repositoryName,
                releaseTag))
            .Where((path) => !AzureBlobPathUtilities.IsGitHubGeneratedSourceArchive(
                Path.GetFileName(path),
                repositoryName,
                effectiveVersion))
            .OrderBy((path) => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task<ReleaseAssetSelectionManifest?> LoadReleaseAssetSelectionManifestAsync()
    {
        if (string.IsNullOrWhiteSpace(ReleaseAssetsManifest))
        {
            return null;
        }

        var manifest = await ReadJsonAsync<ReleaseAssetSelectionManifest>(ReleaseAssetsManifest);
        if (manifest is null)
        {
            throw new Exception($"无法读取资产选择清单: {ReleaseAssetsManifest}");
        }

        if (manifest.Assets.Count == 0)
        {
            throw new Exception($"资产选择清单为空: {ReleaseAssetsManifest}");
        }

        return manifest;
    }

    private async Task<ReleasePublishSummary?> TryLoadMergedPublishSummaryAsync()
    {
        if (string.IsNullOrWhiteSpace(MergedPublishResultsManifest))
        {
            return null;
        }

        var manifest = await ReadJsonAsync<MergedPublishResultsManifest>(MergedPublishResultsManifest);
        if (manifest is null)
        {
            throw new Exception($"无法读取聚合结果清单: {MergedPublishResultsManifest}");
        }

        return await ReleasePublishSummaryArtifacts.MergeAsync(manifest);
    }

    private async Task ExportPublishSummaryAsync(ReleasePublishSummary summary)
    {
        if (string.IsNullOrWhiteSpace(PublishResultOutputPath))
        {
            return;
        }

        await ReleasePublishSummaryArtifacts.WriteAsync(PublishResultOutputPath, summary);
        Log.Information("发布结果已导出: {Path}", PublishResultOutputPath);
    }

    private string GetAzureIndexOutputPath()
    {
        return !string.IsNullOrWhiteSpace(AzureIndexOutputPath)
            ? AzureIndexOutputPath
            : (RootDirectory / "artifacts" / "azure-index.json").ToString();
    }

    private string GetAzureUploadPlanOutputPath()
    {
        return !string.IsNullOrWhiteSpace(AzureUploadPlanOutputPath)
            ? AzureUploadPlanOutputPath
            : (RootDirectory / "artifacts" / "azure-upload-plan.json").ToString();
    }

    private string GetAzureUploadMatrixOutputPath()
    {
        return !string.IsNullOrWhiteSpace(AzureUploadMatrixOutputPath)
            ? AzureUploadMatrixOutputPath
            : (RootDirectory / "artifacts" / "azure-upload-matrix.json").ToString();
    }

    private static async Task<T?> ReadJsonAsync<T>(string path)
    {
        if (!File.Exists(path))
        {
            return default;
        }

        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<T>(stream, CreateJsonOptions(indented: true));
    }

    private static async Task WriteJsonAsync<T>(string path, T value)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(value, CreateJsonOptions(indented: true)));
    }

    private static JsonSerializerOptions CreateJsonOptions(bool indented)
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            WriteIndented = indented,
        };
    }

    private void EnsureAzureSasConfigured()
    {
        if (string.IsNullOrWhiteSpace(AzureBlobSasUrl))
        {
            Log.Error("Azure Blob SAS URL 未配置");
            throw new Exception("必须配置 Azure Blob SAS URL");
        }
    }

    private void EnsureGitHubTokenConfigured()
    {
        if (!string.IsNullOrWhiteSpace(EffectiveGitHubToken))
        {
            return;
        }

        Log.Error("GitHub Token 未配置");
        Log.Error("配置方式:");
        Log.Error("  CI/CD: 工作流中设置 GITHUB_TOKEN 环境变量 (通过 EnableGitHubToken=true 自动注入)");
        Log.Error("  本地: 使用 --github-token 参数");
        Log.Error("所需权限: contents: read (访问 Releases)");
        throw new Exception("必须配置 GitHub Token");
    }

    private void LogPublishCompletion(ReleasePublishSummary summary, string releaseTag, string effectiveVersion)
    {
        Log.Information("=== 同步完成 ===");
        Log.Information("  Release Tag: {Tag}", string.IsNullOrWhiteSpace(releaseTag) ? "(not resolved)" : releaseTag);
        Log.Information("  Azure Version Prefix: {Version}", effectiveVersion);
        Log.Information("  Shard ID: {ShardId}", string.IsNullOrWhiteSpace(summary.ShardId) ? "(none)" : summary.ShardId);
        Log.Information("  产物上传: {ArtifactsStatus}", UploadArtifacts ? "已执行" : "已跳过");
        Log.Information("  Index 上传: {IndexStatus}", summary.IndexUploaded ? "已执行" : (UploadIndex ? "失败/阻止" : "已跳过"));
        Log.Information("  Eligible 资产: {Count}", summary.EligibleAssetCount);
        Log.Information("  sidecar 成功数: {Count}", summary.SidecarSuccessCount);
        Log.Information("  HTTP-only 回退数: {Count}", summary.HttpOnlyFallbackCount);
        Log.Information("  Blob 上传数: {Count}", summary.UploadedBlobCount);
        Log.Information("  Blob 跳过数: {Count}", summary.SkippedBlobCount);
        Log.Information("  Blob 缺失数: {Count}", summary.MissingBlobCount);
    }

    private static void ReportPublishSummary(ReleasePublishSummary summary)
    {
        Log.Information("=== 发布摘要 ===");
        Log.Information("  Shard: {ShardId}", string.IsNullOrWhiteSpace(summary.ShardId) ? "(none)" : summary.ShardId);
        Log.Information("  Eligible 资产数量: {Count}", summary.EligibleAssetCount);
        Log.Information("  sidecar 成功数: {Count}", summary.SidecarSuccessCount);
        Log.Information("  HTTP-only 回退数: {Count}", summary.HttpOnlyFallbackCount);
        Log.Information("  Uploaded blobs: {Count}", summary.UploadedBlobCount);
        Log.Information("  Skipped blobs: {Count}", summary.SkippedBlobCount);
        Log.Information("  Missing blobs: {Count}", summary.MissingBlobCount);

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

    private static string NormalizePublishedVersionPrefix(string versionOrTag)
    {
        var normalized = versionOrTag.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        normalized = normalized.TrimStart('v', 'V');
        return $"v{normalized}";
    }
}
