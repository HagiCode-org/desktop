using System.Text.Json;
using System.Text.Json.Serialization;
using Adapters;
using AzureStorage;
using Nuke.Common.IO;
using Xunit;

namespace PCode.Build.Tests;

public sealed class AzureBlobAdapterTests
{
    [Fact]
    public void BuildIndexResult_WritesAssetsAndFilesAndPreservesFallbacks()
    {
        AbsolutePath root = Path.GetTempPath();
        var adapter = new AzureBlobAdapter(root);
        var directUrl = "https://desktop.dl.hagicode.com/v1.0.0/hagicode-1.0.0-win-x64-nort.zip";
        var githubReleaseUrl = "https://github.com/HagiCode-org/desktop/releases/download/v1.0.0/hagicode-1.0.0-win-x64-nort.zip";
        var publishedArtifacts = new[]
        {
            new PublishedArtifactMetadata
            {
                Name = "hagicode-1.0.0-win-x64-nort.zip",
                LocalFilePath = "/tmp/hagicode-1.0.0-win-x64-nort.zip",
                Path = "v1.0.0/hagicode-1.0.0-win-x64-nort.zip",
                Size = 2048,
                LastModified = DateTime.UnixEpoch,
                DirectUrl = directUrl,
                MeetsThreshold = true,
                HybridEligible = true,
                LegacyHttpFallback = false,
                TorrentPath = "v1.0.0/hagicode-1.0.0-win-x64-nort.zip.torrent",
                TorrentUrl = $"{directUrl}.torrent",
                InfoHash = "abc123",
                Sha256 = "deadbeef",
                WebSeeds = { directUrl },
                DownloadSources =
                {
                    new()
                    {
                        Kind = ArtifactDownloadSourceKinds.Official,
                        Label = "Official",
                        Url = directUrl,
                        Primary = true,
                        WebSeed = true,
                    },
                    new()
                    {
                        Kind = ArtifactDownloadSourceKinds.GitHubRelease,
                        Label = "GitHub Release",
                        Url = githubReleaseUrl,
                        Primary = false,
                        WebSeed = true,
                    },
                },
            },
        };
        var blobs = new List<AzureBlobInfo>
        {
            new() { Name = "v1.0.0/hagicode-1.0.0-win-x64-nort.zip", Size = 2048, LastModified = DateTime.UnixEpoch },
            new() { Name = "v1.0.0/hagicode-1.0.0-win-x64-nort.zip.torrent", Size = 512, LastModified = DateTime.UnixEpoch },
            new() { Name = "v1.0.0/desktop-1.0.0.zip", Size = 64, LastModified = DateTime.UnixEpoch },
            new() { Name = "v1.0.0/desktop-1.0.0.tar.gz", Size = 64, LastModified = DateTime.UnixEpoch },
            new() { Name = "v0.9.0/legacy.zip", Size = 128, LastModified = DateTime.UnixEpoch },
            new() { Name = "v0.8.0/missing.zip", Size = 4096, LastModified = DateTime.UnixEpoch },
            new() { Name = "v0.8.0/missing.zip.torrent", Size = 256, LastModified = DateTime.UnixEpoch },
        };

        var result = adapter.BuildIndexResult(
            blobs,
            "https://example.blob.core.windows.net/releases?sig=test",
            publishedArtifacts,
            "https://desktop.dl.hagicode.com");
        var json = JsonSerializer.Serialize(result.Document, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        });
        using var document = JsonDocument.Parse(json);
        var versions = document.RootElement.GetProperty("versions");

        Assert.Equal(3, versions.GetArrayLength());
        Assert.Equal(3, result.AssetCount);
        Assert.Equal(2, result.HttpOnlyFallbackCount);
        Assert.Contains(result.Diagnostics, (diagnostic) => diagnostic.Code == "historical-http-only");

        var latestVersion = versions.EnumerateArray().First((entry) => entry.GetProperty("version").GetString() == "v1.0.0");
        var latestAsset = latestVersion.GetProperty("assets")[0];
        Assert.Equal("hagicode-1.0.0-win-x64-nort.zip", latestAsset.GetProperty("name").GetString());
        Assert.Equal($"{directUrl}.torrent", latestAsset.GetProperty("torrentUrl").GetString());
        Assert.Equal("deadbeef", latestAsset.GetProperty("sha256").GetString());
        Assert.Equal(githubReleaseUrl, latestAsset.GetProperty("downloadSources")[1].GetProperty("url").GetString());
        Assert.Equal(githubReleaseUrl, latestAsset.GetProperty("webSeeds")[1].GetString());
        Assert.Equal("v1.0.0/hagicode-1.0.0-win-x64-nort.zip", latestVersion.GetProperty("files")[0].GetString());

        var legacyVersion = versions.EnumerateArray().First((entry) => entry.GetProperty("version").GetString() == "v0.9.0");
        var legacyAsset = legacyVersion.GetProperty("assets")[0];
        Assert.False(legacyAsset.TryGetProperty("torrentUrl", out _));
        Assert.Equal("https://desktop.dl.hagicode.com/v0.9.0/legacy.zip", legacyAsset.GetProperty("directUrl").GetString());
    }

    [Fact]
    public async Task GenerateIndexOnlyAsync_WritesEmptyIndexWithoutLinksAndPassesValidation()
    {
        var tempDirectory = CreateTempDirectory();

        try
        {
            AbsolutePath root = tempDirectory;
            var outputPath = Path.Combine(tempDirectory, "azure-index.json");
            var adapter = new AzureBlobAdapter(root, gitHubRepository: "ExampleOrg/custom-desktop");
            var options = new AzureBlobPublishOptions
            {
                SasUrl = "https://example.blob.core.windows.net/releases?sig=test",
                LocalIndexPath = outputPath,
                PublicBaseUrl = BuildConfig.DesktopPublicBaseUrl,
            };

            var indexJson = await adapter.GenerateIndexOnlyAsync(options, outputPath, minify: true);

            Assert.False(string.IsNullOrWhiteSpace(indexJson));
            Assert.True(await adapter.ValidateIndexFileAsync(outputPath));

            using var document = JsonDocument.Parse(indexJson);
            var rootElement = document.RootElement;
            Assert.Equal(0, rootElement.GetProperty("versions").GetArrayLength());
            Assert.Equal(JsonValueKind.Object, rootElement.GetProperty("channels").ValueKind);
            Assert.False(rootElement.TryGetProperty("links", out _));
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), $"hagicode-desktop-azure-index-{Guid.NewGuid():N}");
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
}
