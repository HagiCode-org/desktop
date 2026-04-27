using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using Adapters;
using AzureStorage;
using Nuke.Common.IO;
using Xunit;

namespace PCode.Build.Tests;

public sealed class AzureBlobAdapterTests
{
    [Fact]
    public async Task UploadArtifactsAsync_UsesBoundedParallelUploads()
    {
        var tempDirectory = CreateTempDirectory();

        try
        {
            var tracker = new UploadConcurrencyTracker();
            var container = new FakeBlobContainerClient((blobName) => new FakeBlobClient(blobName, tracker.TrackAsync));
            AbsolutePath root = tempDirectory;
            var adapter = new AzureBlobAdapter(
                root,
                "",
                BuildConfig.DefaultGitHubReleaseRepository,
                (_) => container);

            var filePaths = Enumerable.Range(1, 4)
                .Select((index) =>
                {
                    var filePath = Path.Combine(tempDirectory, $"artifact-{index}.zip");
                    File.WriteAllText(filePath, $"payload-{index}");
                    return filePath;
                })
                .ToList();

            var result = await adapter.UploadArtifactsAsync(
                filePaths,
                new AzureBlobPublishOptions
                {
                    SasUrl = "https://example.blob.core.windows.net/releases?sig=test",
                    VersionPrefix = "v1.0.0",
                    UploadConcurrency = 2,
                });

            Assert.True(result.Success);
            Assert.Equal(4, result.UploadedBlobNames.Count);
            Assert.Equal(2, tracker.MaxObserved);
            Assert.All(result.UploadedBlobNames, (blobName) => Assert.StartsWith("v1.0.0/artifact-", blobName));
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
    }

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
    public void BuildIndexResult_PreservesMergedShardMetadataForFinalIndexGeneration()
    {
        AbsolutePath root = Path.GetTempPath();
        var adapter = new AzureBlobAdapter(root);
        var publishedArtifacts = new[]
        {
            CreatePublishedArtifactMetadata(
                "hagicode-1.0.0-win-x64-nort.zip",
                "v1.0.0/hagicode-1.0.0-win-x64-nort.zip",
                "https://desktop.dl.hagicode.com/v1.0.0/hagicode-1.0.0-win-x64-nort.zip",
                "hash-a",
                "sha-a"),
            CreatePublishedArtifactMetadata(
                "hagicode-1.0.0-osx-arm64-nort.zip",
                "v1.0.0/hagicode-1.0.0-osx-arm64-nort.zip",
                "https://desktop.dl.hagicode.com/v1.0.0/hagicode-1.0.0-osx-arm64-nort.zip",
                "hash-b",
                "sha-b"),
        };
        var blobs = new List<AzureBlobInfo>
        {
            new() { Name = "v1.0.0/hagicode-1.0.0-win-x64-nort.zip", Size = 2048, LastModified = DateTime.UnixEpoch },
            new() { Name = "v1.0.0/hagicode-1.0.0-win-x64-nort.zip.torrent", Size = 512, LastModified = DateTime.UnixEpoch },
            new() { Name = "v1.0.0/hagicode-1.0.0-osx-arm64-nort.zip", Size = 1024, LastModified = DateTime.UnixEpoch },
            new() { Name = "v1.0.0/hagicode-1.0.0-osx-arm64-nort.zip.torrent", Size = 256, LastModified = DateTime.UnixEpoch },
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
        var assets = document.RootElement
            .GetProperty("versions")[0]
            .GetProperty("assets")
            .EnumerateArray()
            .OrderBy((item) => item.GetProperty("name").GetString(), StringComparer.OrdinalIgnoreCase)
            .ToList();

        Assert.Equal(2, assets.Count);
        Assert.Equal("hash-b", assets[0].GetProperty("infoHash").GetString());
        Assert.Equal("sha-b", assets[0].GetProperty("sha256").GetString());
        Assert.Equal("hash-a", assets[1].GetProperty("infoHash").GetString());
        Assert.Equal("sha-a", assets[1].GetProperty("sha256").GetString());
        Assert.Equal(0, result.HttpOnlyFallbackCount);
    }

    [Fact]
    public async Task GenerateIndexFromBlobsWithMetadataAsync_BlocksStaleIndexWhenPublishedArtifactIsNotListed()
    {
        var tempDirectory = CreateTempDirectory();

        try
        {
            AbsolutePath root = tempDirectory;
            var outputPath = Path.Combine(tempDirectory, "azure-index.json");
            var container = new FakeBlobContainerClient(
                (blobName) => new FakeBlobClient(blobName, () => Task.CompletedTask),
                new[]
                {
                    new AzureBlobInfo { Name = "v0.9.0/hagicode-0.9.0-win-x64-nort.zip", Size = 512, LastModified = DateTime.UnixEpoch },
                });
            var adapter = new AzureBlobAdapter(
                root,
                "",
                BuildConfig.DefaultGitHubReleaseRepository,
                (_) => container,
                indexBlobVisibilityMaxAttempts: 1,
                indexBlobVisibilityRetryDelay: TimeSpan.Zero);
            var publishedArtifacts = new[]
            {
                CreatePublishedArtifactMetadata(
                    "hagicode-1.0.0-win-x64-nort.zip",
                    "v1.0.0/hagicode-1.0.0-win-x64-nort.zip",
                    "https://desktop.dl.hagicode.com/v1.0.0/hagicode-1.0.0-win-x64-nort.zip",
                    "hash-a",
                    "sha-a"),
            };

            var result = await adapter.GenerateIndexFromBlobsWithMetadataAsync(
                new AzureBlobPublishOptions
                {
                    SasUrl = "https://example.blob.core.windows.net/releases?sig=test",
                    LocalIndexPath = outputPath,
                    PublicBaseUrl = BuildConfig.DesktopPublicBaseUrl,
                },
                outputPath,
                publishedArtifacts,
                minify: true);

            Assert.Equal("v1.0.0/hagicode-1.0.0-win-x64-nort.zip", Assert.Single(result.MissingPublishedArtifactPaths));
            Assert.Contains(result.Diagnostics, (diagnostic) => diagnostic.Code == "published-artifact-not-listed");
            Assert.True(string.IsNullOrWhiteSpace(result.IndexJson));
            Assert.False(File.Exists(outputPath));
        }
        finally
        {
            DeleteDirectory(tempDirectory);
        }
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

    private static PublishedArtifactMetadata CreatePublishedArtifactMetadata(
        string name,
        string path,
        string directUrl,
        string infoHash,
        string sha256)
    {
        return new PublishedArtifactMetadata
        {
            Name = name,
            LocalFilePath = $"/tmp/{name}",
            Path = path,
            Size = 1024,
            LastModified = DateTime.UnixEpoch,
            DirectUrl = directUrl,
            MeetsThreshold = true,
            HybridEligible = true,
            LegacyHttpFallback = false,
            TorrentPath = $"{path}.torrent",
            TorrentUrl = $"{directUrl}.torrent",
            InfoHash = infoHash,
            Sha256 = sha256,
            WebSeeds = { directUrl },
        };
    }

    private sealed class UploadConcurrencyTracker
    {
        private int _current;

        public int MaxObserved { get; private set; }

        public async Task TrackAsync()
        {
            var current = Interlocked.Increment(ref _current);
            MaxObserved = Math.Max(MaxObserved, current);
            await Task.Delay(75);
            Interlocked.Decrement(ref _current);
        }
    }

    private sealed class FakeBlobContainerClient : IAzureBlobContainerClient
    {
        private readonly Func<string, FakeBlobClient> _factory;
        private readonly Dictionary<string, FakeBlobClient> _clients = new(StringComparer.OrdinalIgnoreCase);
        private readonly IReadOnlyCollection<AzureBlobInfo> _listedBlobs;

        public FakeBlobContainerClient(Func<string, FakeBlobClient> factory, IReadOnlyCollection<AzureBlobInfo>? listedBlobs = null)
        {
            _factory = factory;
            _listedBlobs = listedBlobs ?? Array.Empty<AzureBlobInfo>();
        }

        public IAzureBlobClient GetBlobClient(string blobName)
        {
            if (!_clients.TryGetValue(blobName, out var client))
            {
                client = _factory(blobName);
                _clients[blobName] = client;
            }

            return client;
        }

        public async IAsyncEnumerable<AzureBlobInfo> ListBlobsAsync()
        {
            await Task.CompletedTask;
            foreach (var blob in _listedBlobs)
            {
                yield return blob;
            }
        }
    }

    private sealed class FakeBlobClient : IAzureBlobClient
    {
        private readonly Func<Task> _uploadAction;

        public FakeBlobClient(string name, Func<Task> uploadAction)
        {
            Name = name;
            _uploadAction = uploadAction;
        }

        public Uri Uri => new($"https://example.blob.core.windows.net/releases/{Name}");

        public string Name { get; }

        public Task<bool> ExistsAsync() => Task.FromResult(false);

        public Task<byte[]?> GetContentHashAsync() => Task.FromResult<byte[]?>(null);

        public async Task UploadAsync(Stream content)
        {
            await _uploadAction();
            using var sink = new MemoryStream();
            await content.CopyToAsync(sink);
        }
    }
}
