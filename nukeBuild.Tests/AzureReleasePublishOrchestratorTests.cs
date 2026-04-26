using Adapters;
using AzureStorage;
using Xunit;

namespace PCode.Build.Tests;

public sealed class AzureReleasePublishOrchestratorTests
{
    [Fact]
    public async Task ReleasePublishSummaryArtifacts_WriteAsync_PersistsShardResultJson()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var outputPath = Path.Combine(tempDirectory, "publish-result.json");
            var summary = CreateShardSummary("shard-001", "artifact-a.zip", "v1.0.0/artifact-a.zip");

            await ReleasePublishSummaryArtifacts.WriteAsync(outputPath, summary);
            var persisted = await ReleasePublishSummaryArtifacts.ReadAsync<ReleasePublishSummary>(outputPath);

            Assert.NotNull(persisted);
            Assert.Equal("shard-001", persisted!.ShardId);
            Assert.Equal(1, persisted.EligibleAssetCount);
            Assert.Single(persisted.PublishedArtifacts);
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    [Fact]
    public async Task ReleasePublishSummaryArtifacts_MergeAsync_FailsWhenShardResultIsMissing()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var shardOnePath = Path.Combine(tempDirectory, "publish-result-shard-001.json");
            await ReleasePublishSummaryArtifacts.WriteAsync(
                shardOnePath,
                CreateShardSummary("shard-001", "artifact-a.zip", "v1.0.0/artifact-a.zip"));

            var manifest = new MergedPublishResultsManifest
            {
                ExpectedShardIds = new List<string> { "shard-001", "shard-002" },
                ResultFiles = new List<string> { shardOnePath },
            };

            var error = await Assert.ThrowsAsync<InvalidOperationException>(() => ReleasePublishSummaryArtifacts.MergeAsync(manifest));
            Assert.Contains("shard-002", error.Message);
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    [Fact]
    public async Task ReleasePublishSummaryArtifacts_MergeAsync_AggregatesShardCountsAndMetadata()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var shardOnePath = Path.Combine(tempDirectory, "publish-result-shard-001.json");
            var shardTwoPath = Path.Combine(tempDirectory, "publish-result-shard-002.json");

            await ReleasePublishSummaryArtifacts.WriteAsync(
                shardOnePath,
                CreateShardSummary("shard-001", "artifact-a.zip", "v1.0.0/artifact-a.zip"));
            await ReleasePublishSummaryArtifacts.WriteAsync(
                shardTwoPath,
                CreateShardSummary("shard-002", "artifact-b.zip", "v1.0.0/artifact-b.zip"));

            var merged = await ReleasePublishSummaryArtifacts.MergeAsync(new MergedPublishResultsManifest
            {
                ExpectedShardIds = new List<string> { "shard-001", "shard-002" },
                ResultFiles = new List<string> { shardOnePath, shardTwoPath },
            });

            Assert.True(merged.Success);
            Assert.Equal("finalize", merged.ShardId);
            Assert.Equal(2, merged.EligibleAssetCount);
            Assert.Equal(2, merged.SidecarSuccessCount);
            Assert.Equal(2, merged.UploadedBlobCount);
            Assert.Equal(2, merged.PublishedArtifacts.Count);
            Assert.Contains(merged.PublishedArtifacts, (artifact) => artifact.Name == "artifact-a.zip");
            Assert.Contains(merged.PublishedArtifacts, (artifact) => artifact.Name == "artifact-b.zip");
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    [Fact]
    public async Task PublishAsync_UploadsSidecarsBeforeIndex()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var artifactPath = Path.Combine(tempDirectory, "artifact.zip");
            var sidecarPath = $"{artifactPath}.torrent";
            await File.WriteAllTextAsync(artifactPath, "payload");
            await File.WriteAllTextAsync(sidecarPath, "torrent");

            var builder = new FakeMetadataBuilder(CreateResult(artifactPath, sidecarPath));
            var adapter = new RecordingAzureBlobAdapter();
            var orchestrator = new AzureReleasePublishOrchestrator(builder, adapter);

            var summary = await orchestrator.PublishAsync(
                new[] { artifactPath },
                new AzureBlobPublishOptions { SasUrl = "https://example.blob.core.windows.net/releases?sig=test", VersionPrefix = "1.2.3" },
                Path.Combine(tempDirectory, "index.json"),
                uploadIndex: true,
                minifyIndexJson: true,
                gitHubRepository: BuildConfig.DefaultGitHubReleaseRepository);

            Assert.True(summary.Success);
            Assert.True(summary.IndexUploaded);
            Assert.Equal(new[] { "upload-artifacts", "generate-index", "upload-index" }, adapter.CallOrder);
            Assert.Equal(1, summary.EligibleAssetCount);
            Assert.Equal(1, summary.SidecarSuccessCount);
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    [Fact]
    public async Task PublishAsync_ReportsIndexWriteFailures()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var artifactPath = Path.Combine(tempDirectory, "artifact.zip");
            var sidecarPath = $"{artifactPath}.torrent";
            await File.WriteAllTextAsync(artifactPath, "payload");
            await File.WriteAllTextAsync(sidecarPath, "torrent");

            var builder = new FakeMetadataBuilder(CreateResult(artifactPath, sidecarPath));
            var adapter = new RecordingAzureBlobAdapter { FailIndexUpload = true };
            var orchestrator = new AzureReleasePublishOrchestrator(builder, adapter);

            var summary = await orchestrator.PublishAsync(
                new[] { artifactPath },
                new AzureBlobPublishOptions { SasUrl = "https://example.blob.core.windows.net/releases?sig=test", VersionPrefix = "1.2.3" },
                Path.Combine(tempDirectory, "index.json"),
                uploadIndex: true,
                minifyIndexJson: true,
                gitHubRepository: BuildConfig.DefaultGitHubReleaseRepository);

            Assert.False(summary.Success);
            Assert.Equal("上传 index.json 失败", summary.ErrorMessage);
            Assert.Contains(summary.Diagnostics, (diagnostic) => diagnostic.Stage == ArtifactPublishFailureStage.IndexWrite);
            Assert.Equal(new[] { "upload-artifacts", "generate-index", "upload-index" }, adapter.CallOrder);
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    private static ArtifactMetadataBuildResult CreateResult(string artifactPath, string sidecarPath)
    {
        var result = new ArtifactMetadataBuildResult();
        result.Artifacts.Add(new PublishedArtifactMetadata
        {
            Name = Path.GetFileName(artifactPath),
            LocalFilePath = artifactPath,
            Path = "1.2.3/artifact.zip",
            Size = 10,
            LastModified = DateTime.UnixEpoch,
            DirectUrl = "https://example.blob.core.windows.net/releases/1.2.3/artifact.zip",
            MeetsThreshold = true,
            HybridEligible = true,
            LegacyHttpFallback = false,
            TorrentSidecarLocalPath = sidecarPath,
            TorrentPath = "1.2.3/artifact.zip.torrent",
            TorrentUrl = "https://example.blob.core.windows.net/releases/1.2.3/artifact.zip.torrent",
            InfoHash = "abc",
            Sha256 = "deadbeef",
            WebSeeds = { "https://example.blob.core.windows.net/releases/1.2.3/artifact.zip" },
        });
        return result;
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hagicode-desktop-orchestrator-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    private static void DeleteDirectory(string path)
    {
        if (Directory.Exists(path))
        {
            Directory.Delete(path, recursive: true);
        }
    }

    private static ReleasePublishSummary CreateShardSummary(string shardId, string artifactName, string artifactPath)
    {
        return new ReleasePublishSummary
        {
            ShardId = shardId,
            Success = true,
            EligibleAssetCount = 1,
            SidecarSuccessCount = 1,
            UploadedBlobCount = 1,
            PublishedArtifacts = new List<PublishedArtifactMetadata>
            {
                new()
                {
                    Name = artifactName,
                    LocalFilePath = Path.Combine(Path.GetTempPath(), artifactName),
                    Path = artifactPath,
                    Size = 100,
                    LastModified = DateTime.UnixEpoch,
                    DirectUrl = $"https://desktop.dl.hagicode.com/{artifactPath}",
                    MeetsThreshold = true,
                    HybridEligible = true,
                    LegacyHttpFallback = false,
                    TorrentPath = $"{artifactPath}.torrent",
                    TorrentUrl = $"https://desktop.dl.hagicode.com/{artifactPath}.torrent",
                    InfoHash = $"hash-{shardId}",
                    Sha256 = $"sha-{shardId}",
                    WebSeeds = { $"https://desktop.dl.hagicode.com/{artifactPath}" },
                }
            },
        };
    }

    private sealed class FakeMetadataBuilder : IArtifactHybridMetadataBuilder
    {
        private readonly ArtifactMetadataBuildResult _result;

        public FakeMetadataBuilder(ArtifactMetadataBuildResult result)
        {
            _result = result;
        }

        public Task<ArtifactMetadataBuildResult> BuildAsync(
            IEnumerable<string> filePaths,
            string versionPrefix,
            string containerBaseUrl,
            string? gitHubRepository = null)
            => Task.FromResult(_result);
    }

    private sealed class RecordingAzureBlobAdapter : IAzureBlobAdapter
    {
        public List<string> CallOrder { get; } = new();
        public bool FailIndexUpload { get; set; }

        public Task<bool> ValidateSasUrlAsync(string sasUrl) => Task.FromResult(true);

        public Task<AzureBlobPublishResult> UploadArtifactsAsync(List<string> filePaths, AzureBlobPublishOptions options)
        {
            CallOrder.Add("upload-artifacts");
            return Task.FromResult(new AzureBlobPublishResult
            {
                Success = true,
                UploadedBlobNames = new List<string> { "1.2.3/artifact.zip", "1.2.3/artifact.zip.torrent" },
            });
        }

        public Task<string> GenerateIndexJsonAsync(AzureBlobPublishOptions options, bool minify = false)
            => Task.FromResult("{}");

        public Task<string> GenerateIndexOnlyAsync(AzureBlobPublishOptions options, string outputPath, bool minify = false)
            => Task.FromResult("{}");

        public Task<bool> UploadIndexOnlyAsync(AzureBlobPublishOptions options, string localIndexPath)
            => Task.FromResult(true);

        public Task<bool> ValidateIndexFileAsync(string localIndexPath)
            => Task.FromResult(true);

        public Task<string> GenerateIndexFromBlobsAsync(AzureBlobPublishOptions options, string outputPath, bool minify = false)
        {
            CallOrder.Add("generate-index");
            return Task.FromResult("{}");
        }

        public Task<AzureBlobIndexGenerationResult> GenerateIndexFromBlobsWithMetadataAsync(
            AzureBlobPublishOptions options,
            string outputPath,
            IReadOnlyCollection<PublishedArtifactMetadata> publishedArtifacts,
            bool minify = false)
        {
            CallOrder.Add("generate-index");
            return Task.FromResult(new AzureBlobIndexGenerationResult
            {
                IndexJson = "{}",
                Document = new { versions = Array.Empty<object>(), channels = new { } },
            });
        }

        public Task<bool> UploadIndexJsonAsync(AzureBlobPublishOptions options, string indexJson)
        {
            CallOrder.Add("upload-index");
            return Task.FromResult(!FailIndexUpload);
        }
    }
}
