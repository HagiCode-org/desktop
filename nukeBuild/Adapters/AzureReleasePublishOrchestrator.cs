using AzureStorage;

namespace Adapters;

public sealed class AzureReleasePublishOrchestrator
{
    private readonly IArtifactHybridMetadataBuilder _metadataBuilder;
    private readonly IAzureBlobAdapter _azureBlobAdapter;

    public AzureReleasePublishOrchestrator(
        IArtifactHybridMetadataBuilder metadataBuilder,
        IAzureBlobAdapter azureBlobAdapter)
    {
        _metadataBuilder = metadataBuilder;
        _azureBlobAdapter = azureBlobAdapter;
    }

    public async Task<ReleasePublishSummary> PublishAsync(
        IReadOnlyCollection<string> downloadedFiles,
        AzureBlobPublishOptions options,
        string localIndexPath,
        bool uploadIndex,
        bool minifyIndexJson)
    {
        var summary = new ReleasePublishSummary();
        var containerBaseUrl = Utils.AzureBlobPathUtilities.ResolvePublicBaseUrl(options.SasUrl, options.PublicBaseUrl);
        var metadataResult = await _metadataBuilder.BuildAsync(downloadedFiles, options.VersionPrefix, containerBaseUrl);

        summary.EligibleAssetCount = metadataResult.EligibleArtifactCount;
        summary.SidecarSuccessCount = metadataResult.SidecarSuccessCount;
        summary.HttpOnlyFallbackCount = metadataResult.HttpOnlyFallbackCount;
        summary.Diagnostics.AddRange(metadataResult.Diagnostics);
        summary.PublishedArtifacts.AddRange(metadataResult.Artifacts);

        var filesToUpload = downloadedFiles
            .Concat(metadataResult.Artifacts
                .Select((artifact) => artifact.TorrentSidecarLocalPath)
                .Where((path) => !string.IsNullOrWhiteSpace(path))
                .Cast<string>())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var uploadResult = await _azureBlobAdapter.UploadArtifactsAsync(filesToUpload, options);
        if (!uploadResult.Success)
        {
            summary.ErrorMessage = $"Azure Blob 产物上传失败: {uploadResult.ErrorMessage}";
            return summary;
        }

        var uploadedBlobNames = uploadResult.UploadedBlobNames
            .Concat(uploadResult.SkippedBlobNames)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var artifact in summary.PublishedArtifacts.Where((item) => item.HybridEligible && !string.IsNullOrWhiteSpace(item.TorrentPath)))
        {
            if (uploadedBlobNames.Contains(artifact.TorrentPath!))
            {
                continue;
            }

            artifact.HybridEligible = false;
            artifact.LegacyHttpFallback = true;
            artifact.FallbackReason = "sidecar-upload-missing";
            summary.Diagnostics.Add(new ArtifactPublishDiagnostic
            {
                ArtifactName = artifact.Name,
                Code = "sidecar-upload-missing",
                Message = "torrent sidecar 未成功上传到 Azure Blob，已降级为 HTTP-only。",
                Stage = ArtifactPublishFailureStage.UploadMissing,
            });
        }

        summary.SidecarSuccessCount = summary.PublishedArtifacts.Count((artifact) => artifact.HybridEligible);
        summary.HttpOnlyFallbackCount = summary.PublishedArtifacts.Count((artifact) => artifact.LegacyHttpFallback);

        if (!uploadIndex)
        {
            summary.Success = true;
            return summary;
        }

        var indexResult = await _azureBlobAdapter.GenerateIndexFromBlobsWithMetadataAsync(
            options,
            localIndexPath,
            summary.PublishedArtifacts,
            minifyIndexJson);

        summary.Diagnostics.AddRange(indexResult.Diagnostics);
        summary.HttpOnlyFallbackCount = Math.Max(summary.HttpOnlyFallbackCount, indexResult.HttpOnlyFallbackCount);

        if (string.IsNullOrWhiteSpace(indexResult.IndexJson))
        {
            summary.Diagnostics.Add(new ArtifactPublishDiagnostic
            {
                ArtifactName = "index.json",
                Code = "index-generation-failed",
                Message = "索引生成阶段未返回有效的 index.json。",
                Stage = ArtifactPublishFailureStage.IndexWrite,
            });
            summary.ErrorMessage = "生成 index.json 失败";
            return summary;
        }

        summary.IndexJson = indexResult.IndexJson;
        var uploaded = await _azureBlobAdapter.UploadIndexJsonAsync(options, indexResult.IndexJson);
        if (!uploaded)
        {
            summary.Diagnostics.Add(new ArtifactPublishDiagnostic
            {
                ArtifactName = "index.json",
                Code = "index-upload-failed",
                Message = "index.json 上传失败。",
                Stage = ArtifactPublishFailureStage.IndexWrite,
            });
            summary.ErrorMessage = "上传 index.json 失败";
            return summary;
        }

        summary.IndexUploaded = true;
        summary.Success = true;
        return summary;
    }
}
