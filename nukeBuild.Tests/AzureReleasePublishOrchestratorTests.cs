using Adapters;
using AzureStorage;
using Xunit;

namespace PCode.Build.Tests;

public sealed class AzureReleasePublishOrchestratorTests
{
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
                minifyIndexJson: true);

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
                minifyIndexJson: true);

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

    private sealed class FakeMetadataBuilder : IArtifactHybridMetadataBuilder
    {
        private readonly ArtifactMetadataBuildResult _result;

        public FakeMetadataBuilder(ArtifactMetadataBuildResult result)
        {
            _result = result;
        }

        public Task<ArtifactMetadataBuildResult> BuildAsync(IEnumerable<string> filePaths, string versionPrefix, string containerBaseUrl)
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
