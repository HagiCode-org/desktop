namespace AzureStorage;

public static class HybridDistributionConstants
{
    public const long ThresholdBytes = 100L * 1024 * 1024;
    public const int DefaultPieceLengthBytes = 1024 * 1024;
}

public enum ArtifactPublishFailureStage
{
    MetadataBuild,
    SidecarGeneration,
    UploadMissing,
    IndexWrite
}

public sealed class ArtifactPublishDiagnostic
{
    public required string ArtifactName { get; init; }
    public required string Code { get; init; }
    public required string Message { get; init; }
    public ArtifactPublishFailureStage? Stage { get; init; }
}

public sealed class PublishedArtifactMetadata
{
    public required string Name { get; init; }
    public required string LocalFilePath { get; init; }
    public required string Path { get; init; }
    public required long Size { get; init; }
    public required DateTime LastModified { get; init; }
    public required string DirectUrl { get; init; }
    public string? TorrentSidecarLocalPath { get; set; }
    public string? TorrentPath { get; set; }
    public string? TorrentUrl { get; set; }
    public string? InfoHash { get; set; }
    public string? Sha256 { get; set; }
    public List<string> WebSeeds { get; init; } = new();
    public List<ArtifactDownloadSource> DownloadSources { get; init; } = new();
    public bool MeetsThreshold { get; init; }
    public bool HybridEligible { get; set; }
    public bool LegacyHttpFallback { get; set; }
    public string? FallbackReason { get; set; }
}

public static class ArtifactDownloadSourceKinds
{
    public const string Official = "official";
    public const string GitHubRelease = "github-release";
}

public sealed class ArtifactDownloadSource
{
    public required string Kind { get; init; }
    public required string Label { get; init; }
    public required string Url { get; init; }
    public bool Primary { get; init; }
    public bool WebSeed { get; init; }
}

public sealed class ArtifactMetadataBuildResult
{
    public List<PublishedArtifactMetadata> Artifacts { get; } = new();
    public List<ArtifactPublishDiagnostic> Diagnostics { get; } = new();

    public int EligibleArtifactCount => Artifacts.Count((artifact) => artifact.MeetsThreshold);
    public int SidecarSuccessCount => Artifacts.Count((artifact) => artifact.HybridEligible);
    public int HttpOnlyFallbackCount => Artifacts.Count((artifact) => artifact.LegacyHttpFallback);
}

public sealed class AzureBlobIndexGenerationResult
{
    public string IndexJson { get; set; } = string.Empty;
    public object? Document { get; set; }
    public int VersionCount { get; set; }
    public int AssetCount { get; set; }
    public int HttpOnlyFallbackCount { get; set; }
    public List<ArtifactPublishDiagnostic> Diagnostics { get; } = new();
}

public sealed class ReleasePublishSummary
{
    public bool Success { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    public string IndexJson { get; set; } = string.Empty;
    public bool IndexUploaded { get; set; }
    public int EligibleAssetCount { get; set; }
    public int SidecarSuccessCount { get; set; }
    public int HttpOnlyFallbackCount { get; set; }
    public List<PublishedArtifactMetadata> PublishedArtifacts { get; } = new();
    public List<ArtifactPublishDiagnostic> Diagnostics { get; } = new();
}
