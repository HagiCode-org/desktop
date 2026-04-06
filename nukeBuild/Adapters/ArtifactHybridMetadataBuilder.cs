using System.Security.Cryptography;
using AzureStorage;
using Utils;

namespace Adapters;

public sealed class ArtifactHybridMetadataBuilder : IArtifactHybridMetadataBuilder
{
    private readonly ITorrentSidecarGenerator _torrentSidecarGenerator;
    private readonly long _thresholdBytes;

    public ArtifactHybridMetadataBuilder(
        ITorrentSidecarGenerator? torrentSidecarGenerator = null,
        long thresholdBytes = HybridDistributionConstants.ThresholdBytes)
    {
        if (thresholdBytes <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(thresholdBytes));
        }

        _torrentSidecarGenerator = torrentSidecarGenerator ?? new TorrentSidecarGenerator();
        _thresholdBytes = thresholdBytes;
    }

    public async Task<ArtifactMetadataBuildResult> BuildAsync(
        IEnumerable<string> filePaths,
        string versionPrefix,
        string containerBaseUrl,
        string? gitHubRepository = null)
    {
        var result = new ArtifactMetadataBuildResult();
        var normalizedPrefix = AzureBlobPathUtilities.NormalizeVersionPrefix(versionPrefix);
        var normalizedRepository = NormalizeGitHubRepository(gitHubRepository);

        foreach (var filePath in filePaths
            .Where((path) => !path.EndsWith(".torrent", StringComparison.OrdinalIgnoreCase))
            .OrderBy((path) => path, StringComparer.OrdinalIgnoreCase))
        {
            var fileInfo = new FileInfo(filePath);
            if (!fileInfo.Exists)
            {
                result.Diagnostics.Add(new ArtifactPublishDiagnostic
                {
                    ArtifactName = Path.GetFileName(filePath),
                    Code = "source-missing",
                    Message = $"源产物不存在：{filePath}",
                    Stage = ArtifactPublishFailureStage.MetadataBuild,
                });
                continue;
            }

            var blobPath = AzureBlobPathUtilities.BuildBlobPath(normalizedPrefix, fileInfo.Name);
            var directUrl = AzureBlobPathUtilities.BuildBlobUrl(containerBaseUrl, blobPath);
            var artifact = new PublishedArtifactMetadata
            {
                Name = fileInfo.Name,
                LocalFilePath = fileInfo.FullName,
                Path = blobPath,
                Size = fileInfo.Length,
                LastModified = fileInfo.LastWriteTimeUtc,
                DirectUrl = directUrl,
                MeetsThreshold = fileInfo.Length >= _thresholdBytes,
                HybridEligible = false,
                LegacyHttpFallback = true,
                FallbackReason = "http-only-below-threshold",
            };

            AddDownloadSource(artifact, CreateOfficialDownloadSource(directUrl));
            if (TryCreateGitHubReleaseDownloadSource(fileInfo.Name, normalizedPrefix, normalizedRepository, out var gitHubSource))
            {
                AddDownloadSource(artifact, gitHubSource!);
            }
            else
            {
                result.Diagnostics.Add(new ArtifactPublishDiagnostic
                {
                    ArtifactName = artifact.Name,
                    Code = "github-release-mirror-omitted",
                    Message = "无法解析 GitHub Release 镜像，已仅保留官网下载源。",
                    Stage = ArtifactPublishFailureStage.MetadataBuild,
                });
            }

            if (!artifact.MeetsThreshold)
            {
                result.Artifacts.Add(artifact);
                continue;
            }

            try
            {
                artifact.Sha256 = await ComputeSha256Async(fileInfo.FullName);
            }
            catch (Exception ex)
            {
                artifact.FallbackReason = "missing-hash";
                result.Diagnostics.Add(new ArtifactPublishDiagnostic
                {
                    ArtifactName = artifact.Name,
                    Code = "missing-hash",
                    Message = $"无法计算 sha256：{ex.Message}",
                    Stage = ArtifactPublishFailureStage.MetadataBuild,
                });
                result.Artifacts.Add(artifact);
                continue;
            }

            var sidecarPath = $"{fileInfo.FullName}.torrent";
            var torrentBlobPath = $"{artifact.Path}.torrent";
            var torrentUrl = AzureBlobPathUtilities.BuildBlobUrl(containerBaseUrl, torrentBlobPath);

            try
            {
                var sidecar = await _torrentSidecarGenerator.GenerateAsync(new TorrentSidecarRequest
                {
                    SourcePath = fileInfo.FullName,
                    SidecarPath = sidecarPath,
                    DisplayName = fileInfo.Name,
                    WebSeeds = artifact.WebSeeds,
                });

                artifact.TorrentSidecarLocalPath = sidecar.SidecarPath;
                artifact.TorrentPath = torrentBlobPath;
                artifact.TorrentUrl = torrentUrl;
                artifact.InfoHash = sidecar.InfoHash;
                artifact.HybridEligible = IsHybridMetadataComplete(artifact);
                artifact.LegacyHttpFallback = !artifact.HybridEligible;
                artifact.FallbackReason = artifact.HybridEligible ? null : "incomplete-hybrid-metadata";
            }
            catch (Exception ex)
            {
                artifact.FallbackReason = "sidecar-generation-failed";
                artifact.LegacyHttpFallback = true;
                artifact.HybridEligible = false;
                TryDeleteFile(sidecarPath);
                result.Diagnostics.Add(new ArtifactPublishDiagnostic
                {
                    ArtifactName = artifact.Name,
                    Code = "sidecar-generation-failed",
                    Message = $"无法生成 torrent sidecar：{ex.Message}",
                    Stage = ArtifactPublishFailureStage.SidecarGeneration,
                });
            }

            if (!artifact.HybridEligible && artifact.MeetsThreshold && artifact.FallbackReason == "incomplete-hybrid-metadata")
            {
                result.Diagnostics.Add(new ArtifactPublishDiagnostic
                {
                    ArtifactName = artifact.Name,
                    Code = "incomplete-hybrid-metadata",
                    Message = "混合分发元数据不完整，已安全降级为 HTTP-only。",
                    Stage = ArtifactPublishFailureStage.MetadataBuild,
                });
            }

            result.Artifacts.Add(artifact);
        }

        return result;
    }

    private static bool IsHybridMetadataComplete(PublishedArtifactMetadata artifact)
    {
        return !string.IsNullOrWhiteSpace(artifact.TorrentUrl)
            && !string.IsNullOrWhiteSpace(artifact.InfoHash)
            && !string.IsNullOrWhiteSpace(artifact.Sha256)
            && artifact.WebSeeds.Count > 0;
    }

    private static ArtifactDownloadSource CreateOfficialDownloadSource(string directUrl)
    {
        return new ArtifactDownloadSource
        {
            Kind = ArtifactDownloadSourceKinds.Official,
            Label = "Official",
            Url = directUrl,
            Primary = true,
            WebSeed = true,
        };
    }

    private static bool TryCreateGitHubReleaseDownloadSource(
        string fileName,
        string versionPrefix,
        string? gitHubRepository,
        out ArtifactDownloadSource? downloadSource)
    {
        downloadSource = null;

        if (string.IsNullOrWhiteSpace(gitHubRepository))
        {
            return false;
        }

        var tagName = NormalizeTagName(versionPrefix);
        var encodedFileName = Uri.EscapeDataString(fileName);
        downloadSource = new ArtifactDownloadSource
        {
            Kind = ArtifactDownloadSourceKinds.GitHubRelease,
            Label = "GitHub Release",
            Url = $"https://github.com/{gitHubRepository}/releases/download/{tagName}/{encodedFileName}",
            Primary = false,
            WebSeed = true,
        };

        return true;
    }

    private static string NormalizeTagName(string versionPrefix)
    {
        var value = versionPrefix.Trim();
        if (value.StartsWith('v') || value.StartsWith('V'))
        {
            return $"v{value[1..]}";
        }

        return $"v{value}";
    }

    private static string? NormalizeGitHubRepository(string? gitHubRepository)
    {
        var value = gitHubRepository?.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim('/');
    }

    private static void AddDownloadSource(PublishedArtifactMetadata artifact, ArtifactDownloadSource downloadSource)
    {
        var existing = artifact.DownloadSources.Any((item) =>
            string.Equals(item.Url, downloadSource.Url, StringComparison.OrdinalIgnoreCase)
            && string.Equals(item.Kind, downloadSource.Kind, StringComparison.OrdinalIgnoreCase));

        if (!existing)
        {
            artifact.DownloadSources.Add(downloadSource);
        }

        if (downloadSource.WebSeed
            && !artifact.WebSeeds.Contains(downloadSource.Url, StringComparer.OrdinalIgnoreCase))
        {
            artifact.WebSeeds.Add(downloadSource.Url);
        }
    }

    private static async Task<string> ComputeSha256Async(string filePath)
    {
        await using var stream = File.OpenRead(filePath);
        var hash = await SHA256.HashDataAsync(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static void TryDeleteFile(string filePath)
    {
        try
        {
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
        catch
        {
        }
    }
}
