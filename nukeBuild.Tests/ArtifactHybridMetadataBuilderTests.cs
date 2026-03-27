using Adapters;
using AzureStorage;
using Xunit;

namespace PCode.Build.Tests;

public sealed class ArtifactHybridMetadataBuilderTests
{
    [Fact]
    public async Task BuildAsync_GeneratesHybridMetadataForEligibleArtifact()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var artifactPath = Path.Combine(tempDirectory, "hagicode-1.2.3-win-x64-nort.zip");
            await File.WriteAllBytesAsync(artifactPath, Enumerable.Repeat((byte)0x2A, 4096).ToArray());

            var builder = new ArtifactHybridMetadataBuilder(new TorrentSidecarGenerator(pieceLengthBytes: 64), thresholdBytes: 1);
            var result = await builder.BuildAsync(new[] { artifactPath }, "v1.2.3", "https://desktop.dl.hagicode.com/");

            var artifact = Assert.Single(result.Artifacts);
            Assert.True(artifact.MeetsThreshold);
            Assert.True(artifact.HybridEligible);
            Assert.False(artifact.LegacyHttpFallback);
            Assert.Equal("v1.2.3/hagicode-1.2.3-win-x64-nort.zip", artifact.Path);
            Assert.Equal("https://desktop.dl.hagicode.com/v1.2.3/hagicode-1.2.3-win-x64-nort.zip", artifact.DirectUrl);
            Assert.Equal("https://desktop.dl.hagicode.com/v1.2.3/hagicode-1.2.3-win-x64-nort.zip.torrent", artifact.TorrentUrl);
            Assert.Contains(artifact.DirectUrl, artifact.WebSeeds);
            Assert.False(string.IsNullOrWhiteSpace(artifact.InfoHash));
            Assert.False(string.IsNullOrWhiteSpace(artifact.Sha256));
            Assert.True(File.Exists(artifact.TorrentSidecarLocalPath));
            Assert.Empty(result.Diagnostics);
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    [Fact]
    public async Task BuildAsync_SkipsSmallArtifacts()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var artifactPath = Path.Combine(tempDirectory, "small.zip");
            await File.WriteAllBytesAsync(artifactPath, new byte[] { 1, 2, 3, 4 });

            var builder = new ArtifactHybridMetadataBuilder(thresholdBytes: 1024);
            var result = await builder.BuildAsync(new[] { artifactPath }, "1.2.3", "https://example.blob.core.windows.net/releases/");

            var artifact = Assert.Single(result.Artifacts);
            Assert.False(artifact.MeetsThreshold);
            Assert.False(artifact.HybridEligible);
            Assert.True(artifact.LegacyHttpFallback);
            Assert.Equal("http-only-below-threshold", artifact.FallbackReason);
            Assert.Null(artifact.TorrentSidecarLocalPath);
            Assert.False(File.Exists($"{artifactPath}.torrent"));
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    [Fact]
    public async Task BuildAsync_BlocksIncompleteMetadataWhenSidecarFails()
    {
        var tempDirectory = CreateTempDirectory();
        try
        {
            var artifactPath = Path.Combine(tempDirectory, "broken.zip");
            await File.WriteAllBytesAsync(artifactPath, Enumerable.Repeat((byte)0x3A, 128).ToArray());

            var builder = new ArtifactHybridMetadataBuilder(new FailingTorrentSidecarGenerator(), thresholdBytes: 1);
            var result = await builder.BuildAsync(new[] { artifactPath }, "1.2.3", "https://example.blob.core.windows.net/releases/");

            var artifact = Assert.Single(result.Artifacts);
            Assert.False(artifact.HybridEligible);
            Assert.True(artifact.LegacyHttpFallback);
            Assert.Equal("sidecar-generation-failed", artifact.FallbackReason);
            Assert.Contains(result.Diagnostics, (diagnostic) => diagnostic.Stage == ArtifactPublishFailureStage.SidecarGeneration);
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hagicode-desktop-tests-{Guid.NewGuid():N}");
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

    private sealed class FailingTorrentSidecarGenerator : ITorrentSidecarGenerator
    {
        public Task<TorrentSidecarResult> GenerateAsync(TorrentSidecarRequest request)
            => throw new InvalidOperationException("simulated torrent failure");
    }
}
