using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using AzureStorage;
using System.Collections.Concurrent;
using System.Threading;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Security.Cryptography;
using Utils;

namespace Adapters;

/// <summary>
/// Azure Blob Storage adapter implementation
/// Uses SAS URL for authentication and upload
/// </summary>
public class AzureBlobAdapter : IAzureBlobAdapter
{
    private readonly AbsolutePath _rootDirectory;
    private readonly Dictionary<string, string> _customChannelMapping;
    private readonly string _gitHubRepository;
    private readonly string _gitHubRepositoryName;
    private readonly Func<Uri, IAzureBlobContainerClient> _containerFactory;

    public AzureBlobAdapter(
        AbsolutePath rootDirectory,
        string channelMappingJson = "",
        string gitHubRepository = BuildConfig.DefaultGitHubReleaseRepository)
        : this(rootDirectory, channelMappingJson, gitHubRepository, null)
    {
    }

    internal AzureBlobAdapter(
        AbsolutePath rootDirectory,
        string channelMappingJson,
        string gitHubRepository,
        Func<Uri, IAzureBlobContainerClient>? containerFactory)
    {
        _rootDirectory = rootDirectory;
        _customChannelMapping = ParseChannelMapping(channelMappingJson);
        _gitHubRepository = BuildConfig.NormalizeGitHubRepository(gitHubRepository);
        _gitHubRepositoryName = BuildConfig.ResolveGitHubReleaseRepositoryName(_gitHubRepository);
        _containerFactory = containerFactory ?? ((sasUri) => new AzureBlobContainerClientAdapter(new BlobContainerClient(sasUri)));
    }

    private static Dictionary<string, string> ParseChannelMapping(string channelMappingJson)
    {
        if (string.IsNullOrWhiteSpace(channelMappingJson))
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            var mapping = JsonSerializer.Deserialize<Dictionary<string, string>>(channelMappingJson);
            return mapping ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            Log.Warning("Invalid channel mapping JSON, using default rules");
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    public Task<bool> ValidateSasUrlAsync(string sasUrl)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(sasUrl))
            {
                Log.Warning("SAS URL is empty");
                return Task.FromResult(false);
            }

            _ = new Uri(sasUrl);
            Log.Information("Validating SAS URL");
            return Task.FromResult(true);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "SAS URL validation failed");
            return Task.FromResult(false);
        }
    }

    public async Task<AzureBlobPublishResult> UploadArtifactsAsync(List<string> filePaths, AzureBlobPublishOptions options)
    {
        var result = new AzureBlobPublishResult();

        try
        {
            if (string.IsNullOrWhiteSpace(options.SasUrl))
            {
                result.Success = false;
                result.ErrorMessage = "SAS URL cannot be empty";
                return result;
            }

            var containerClient = _containerFactory(new Uri(options.SasUrl));
            Log.Information("Container: {Container}", options.ContainerName);
            Log.Information("Version prefix: {Prefix}", options.VersionPrefix ?? "(none)");
            var distinctFiles = filePaths
                .Where((path) => !string.IsNullOrWhiteSpace(path))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var uploadedBlobs = new ConcurrentBag<string>();
            var uploadedBlobNames = new ConcurrentBag<string>();
            var skippedBlobs = new ConcurrentBag<string>();
            var skippedBlobNames = new ConcurrentBag<string>();
            var missingBlobNames = new ConcurrentBag<string>();
            var failedBlobNames = new ConcurrentBag<string>();
            var warnings = new ConcurrentBag<string>();
            var errors = new ConcurrentBag<string>();
            var concurrency = Math.Max(1, options.UploadConcurrency);

            using var semaphore = new SemaphoreSlim(concurrency, concurrency);
            var uploadTasks = distinctFiles.Select(async (filePath) =>
            {
                await semaphore.WaitAsync();
                try
                {
                    var fileName = Path.GetFileName(filePath);
                    var blobName = AzureBlobPathUtilities.BuildBlobPath(options.VersionPrefix, fileName);

                    if (!File.Exists(filePath))
                    {
                        Log.Warning("File not found: {Path}", filePath);
                        warnings.Add($"[upload-missing] {filePath}");
                        missingBlobNames.Add(blobName);
                        return;
                    }

                    var blobClient = containerClient.GetBlobClient(blobName);
                    if (await ShouldSkipUploadAsync(blobClient, filePath, fileName))
                    {
                        skippedBlobs.Add(blobClient.Uri.ToString());
                        skippedBlobNames.Add(blobName);
                        return;
                    }

                    Log.Information("Uploading: {File} -> {Container}/{Blob}", fileName, options.ContainerName, blobName);
                    await UploadFileWithRetriesAsync(blobClient, filePath, options.UploadRetries);
                    var blobUrl = blobClient.Uri.ToString();
                    uploadedBlobs.Add(blobUrl);
                    uploadedBlobNames.Add(blobName);
                    Log.Information("Upload successful: {Url}", blobUrl);
                }
                catch (Exception ex)
                {
                    var failedBlobName = AzureBlobPathUtilities.BuildBlobPath(options.VersionPrefix, Path.GetFileName(filePath));
                    failedBlobNames.Add(failedBlobName);
                    var error = $"{failedBlobName}: {ex.Message}";
                    errors.Add(error);
                    Log.Error(ex, "Azure Blob 上传失败: {Blob}", failedBlobName);
                }
                finally
                {
                    semaphore.Release();
                }
            });

            await Task.WhenAll(uploadTasks);

            result.UploadedBlobs = uploadedBlobs.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.UploadedBlobNames = uploadedBlobNames.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.SkippedBlobs = skippedBlobs.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.SkippedBlobNames = skippedBlobNames.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.MissingBlobNames = missingBlobNames.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.FailedBlobNames = failedBlobNames.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.Warnings = warnings.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.Errors = errors.OrderBy((item) => item, StringComparer.OrdinalIgnoreCase).ToList();
            result.Success = result.Errors.Count == 0;
            result.ErrorMessage = result.Errors.Count == 0
                ? string.Empty
                : string.Join("; ", result.Errors);
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.ErrorMessage = ex.Message;
            Log.Error(ex, "Azure Blob upload failed");
        }

        return result;
    }

    private static async Task<bool> ShouldSkipUploadAsync(IAzureBlobClient blobClient, string filePath, string fileName)
    {
        if (!await blobClient.ExistsAsync())
        {
            return false;
        }

        var remoteHash = await blobClient.GetContentHashAsync();

        byte[] localHash;
        await using (var hashStream = File.OpenRead(filePath))
        using (var md5 = MD5.Create())
        {
            localHash = await md5.ComputeHashAsync(hashStream);
        }

        if (remoteHash == null || !localHash.SequenceEqual(remoteHash))
        {
            return false;
        }

        Log.Information("Skipping {File} (unchanged, hash: {Hash})", fileName, Convert.ToHexString(localHash)[..8]);
        return true;
    }

    private static async Task UploadFileWithRetriesAsync(IAzureBlobClient blobClient, string filePath, int retryCount)
    {
        var attempts = Math.Max(1, retryCount + 1);
        Exception? lastError = null;

        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            try
            {
                await using var stream = File.OpenRead(filePath);
                await blobClient.UploadAsync(stream);
                return;
            }
            catch (Exception ex) when (attempt < attempts)
            {
                lastError = ex;
                Log.Warning(ex, "Upload attempt {Attempt}/{Attempts} failed for {Blob}", attempt, attempts, blobClient.Name);
            }
            catch (Exception ex)
            {
                lastError = ex;
                break;
            }
        }

        throw lastError ?? new InvalidOperationException($"上传 {blobClient.Name} 失败");
    }

    public async Task<string> GenerateIndexJsonAsync(AzureBlobPublishOptions options, bool minify = false)
    {
        var indexPath = !string.IsNullOrWhiteSpace(options.LocalIndexPath)
            ? options.LocalIndexPath
            : Path.Combine(_rootDirectory, "artifacts", "index.json");

        return await GenerateIndexOnlyAsync(options, indexPath, minify);
    }

    public async Task<string> GenerateIndexOnlyAsync(AzureBlobPublishOptions options, string outputPath, bool minify = false)
    {
        try
        {
            var outputDir = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
            {
                Directory.CreateDirectory(outputDir);
            }

            var indexResult = BuildIndexResult(
                Array.Empty<AzureBlobInfo>(),
                options.SasUrl,
                Array.Empty<PublishedArtifactMetadata>(),
                options.PublicBaseUrl);

            var jsonContent = SerializeJson(indexResult.Document!, minify);
            await File.WriteAllTextAsync(outputPath, jsonContent);

            Log.Information("Index.json generated at: {Path}", outputPath);
            return jsonContent;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to generate index.json");
            return string.Empty;
        }
    }

    public async Task<bool> UploadIndexOnlyAsync(AzureBlobPublishOptions options, string localIndexPath)
    {
        try
        {
            if (!File.Exists(localIndexPath))
            {
                Log.Error("Index file not found: {Path}", localIndexPath);
                return false;
            }

            var indexContent = await File.ReadAllTextAsync(localIndexPath);
            return await UploadIndexJsonAsync(options, indexContent);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to upload index from file");
            return false;
        }
    }

    public async Task<bool> ValidateIndexFileAsync(string localIndexPath)
    {
        try
        {
            if (!File.Exists(localIndexPath))
            {
                Log.Error("Index file not found: {Path}", localIndexPath);
                return false;
            }

            var content = await File.ReadAllTextAsync(localIndexPath);
            using var document = JsonDocument.Parse(content);
            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Object)
            {
                Log.Error("Index.json root must be an object");
                return false;
            }

            if (!TryValidateRequiredString(root, "updatedAt", out var updatedAtValue)
                || !DateTimeOffset.TryParse(updatedAtValue, out _))
            {
                Log.Error("Index.json updatedAt is missing or invalid");
                return false;
            }

            if (!root.TryGetProperty("versions", out var versions) || versions.ValueKind != JsonValueKind.Array)
            {
                Log.Error("Index.json versions must be an array");
                return false;
            }

            if (!root.TryGetProperty("channels", out var channels) || channels.ValueKind != JsonValueKind.Object)
            {
                Log.Error("Index.json channels must be an object");
                return false;
            }

            Log.Information("Index.json validation passed");
            return true;
        }
        catch (JsonException ex)
        {
            Log.Error(ex, "Index.json is not valid JSON");
            return false;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Index.json validation failed");
            return false;
        }
    }

    public async Task<bool> UploadIndexJsonAsync(AzureBlobPublishOptions options, string indexJson)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(options.SasUrl))
            {
                Log.Error("SAS URL is required for upload");
                return false;
            }

            var containerClient = _containerFactory(new Uri(options.SasUrl));
            var blobClient = containerClient.GetBlobClient("index.json");

            Log.Information("Uploading index.json to Azure Blob Storage...");

            await using var stream = new MemoryStream(Encoding.UTF8.GetBytes(indexJson));
            await blobClient.UploadAsync(stream);

            Log.Information("index.json uploaded successfully: {Url}", blobClient.Uri);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to upload index.json");
            return false;
        }
    }

    public async Task<List<AzureBlobInfo>> ListBlobsAsync(AzureBlobPublishOptions options)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(options.SasUrl))
            {
                Log.Error("SAS URL is required to list blobs");
                return new List<AzureBlobInfo>();
            }

            var containerClient = _containerFactory(new Uri(options.SasUrl));
            var blobs = new List<AzureBlobInfo>();

            Log.Information("Listing blobs in container: {Container}", options.ContainerName);

            await foreach (var blobItem in containerClient.ListBlobsAsync())
            {
                if (blobItem.Name == "index.json")
                {
                    continue;
                }

                blobs.Add(blobItem);
            }

            Log.Information("Found {Count} blobs (excluding index.json)", blobs.Count);
            return blobs;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to list blobs");
            return new List<AzureBlobInfo>();
        }
    }

    public async Task<string> GenerateIndexFromBlobsAsync(AzureBlobPublishOptions options, string outputPath, bool minify = false)
    {
        var result = await GenerateIndexFromBlobsWithMetadataAsync(options, outputPath, Array.Empty<PublishedArtifactMetadata>(), minify);
        return result.IndexJson;
    }

    public async Task<AzureBlobIndexGenerationResult> GenerateIndexFromBlobsWithMetadataAsync(
        AzureBlobPublishOptions options,
        string outputPath,
        IReadOnlyCollection<PublishedArtifactMetadata> publishedArtifacts,
        bool minify = false)
    {
        try
        {
            Log.Information("=== Generating index.json from Azure blobs ===");

            var outputDir = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
            {
                Directory.CreateDirectory(outputDir);
            }

            var blobs = await ListBlobsAsync(options);
            var result = BuildIndexResult(blobs, options.SasUrl, publishedArtifacts, options.PublicBaseUrl);
            result.IndexJson = SerializeJson(result.Document!, minify);
            await File.WriteAllTextAsync(outputPath, result.IndexJson);

            Log.Information("✅ Index.json generated at: {Path}", outputPath);
            Log.Information("   Versions: {Count}", result.VersionCount);
            Log.Information("   Total assets: {Count}", result.AssetCount);
            Log.Information("   HTTP-only fallbacks: {Count}", result.HttpOnlyFallbackCount);

            return result;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to generate index from blobs");
            return new AzureBlobIndexGenerationResult();
        }
    }

    public AzureBlobIndexGenerationResult BuildIndexResult(
        IReadOnlyCollection<AzureBlobInfo> blobs,
        string sasUrl,
        IReadOnlyCollection<PublishedArtifactMetadata> publishedArtifacts = null,
        string publicBaseUrl = "")
    {
        var containerBaseUrl = AzureBlobPathUtilities.ResolvePublicBaseUrl(sasUrl, publicBaseUrl);
        var metadataByPath = (publishedArtifacts ?? Array.Empty<PublishedArtifactMetadata>())
            .ToDictionary((artifact) => artifact.Path, StringComparer.OrdinalIgnoreCase);

        var versionGroups = blobs
            .GroupBy((blob) => AzureBlobPathUtilities.ExtractVersion(blob.Name), StringComparer.OrdinalIgnoreCase)
            .OrderByDescending((group) => group.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var versionList = new List<VersionGroup>();
        var diagnostics = new List<ArtifactPublishDiagnostic>();
        var totalAssets = 0;
        var httpOnlyFallbackCount = 0;

        foreach (var versionGroup in versionGroups)
        {
            var blobsByName = versionGroup.ToDictionary((blob) => blob.Name, StringComparer.OrdinalIgnoreCase);
            var artifactBlobs = versionGroup
                .Where((blob) => !blob.Name.EndsWith(".torrent", StringComparison.OrdinalIgnoreCase))
                .Where((blob) => !AzureBlobPathUtilities.IsGitHubGeneratedSourceArchive(
                    Path.GetFileName(blob.Name),
                    _gitHubRepositoryName,
                    versionGroup.Key))
                .OrderBy((blob) => blob.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var indexedAssets = new List<AzureIndexedAsset>();
            var fileProjection = new List<string>();

            foreach (var blob in artifactBlobs)
            {
                totalAssets += 1;
                fileProjection.Add(blob.Name);

                metadataByPath.TryGetValue(blob.Name, out var metadata);
                var directUrl = metadata?.DirectUrl ?? AzureBlobPathUtilities.BuildBlobUrl(containerBaseUrl, blob.Name);
                var asset = new AzureIndexedAsset
                {
                    Name = Path.GetFileName(blob.Name),
                    Path = blob.Name,
                    Size = blob.Size,
                    LastModified = blob.LastModified.ToString("o"),
                    DirectUrl = directUrl,
                };

                var sidecarBlobName = $"{blob.Name}.torrent";
                var hasSidecarBlob = blobsByName.ContainsKey(sidecarBlobName);
                var canPublishHybrid = metadata?.HybridEligible == true && hasSidecarBlob;
                var indexedDownloadSources = BuildIndexedDownloadSources(metadata, directUrl);
                var indexedWebSeeds = BuildIndexedWebSeeds(metadata, indexedDownloadSources, directUrl);

                if (indexedDownloadSources.Count > 0)
                {
                    asset.DownloadSources = indexedDownloadSources;
                }

                if (indexedWebSeeds.Count > 0)
                {
                    asset.WebSeeds = indexedWebSeeds;
                }

                if (canPublishHybrid)
                {
                    asset.TorrentUrl = metadata!.TorrentUrl;
                    asset.InfoHash = metadata.InfoHash;
                    asset.Sha256 = metadata.Sha256;
                }
                else
                {
                    httpOnlyFallbackCount += 1;
                    if (hasSidecarBlob && metadata?.HybridEligible != true)
                    {
                        diagnostics.Add(new ArtifactPublishDiagnostic
                        {
                            ArtifactName = asset.Name,
                            Code = metadata == null ? "historical-http-only" : "missing-hybrid-metadata",
                            Message = metadata == null
                                ? "发现 sidecar 但缺少发布期元数据，已保留 HTTP-only 兼容输出。"
                                : "hybrid 元数据不完整，已保留 HTTP-only 兼容输出。",
                            Stage = ArtifactPublishFailureStage.MetadataBuild,
                        });
                    }
                    else if (!hasSidecarBlob && metadata?.HybridEligible == true)
                    {
                        diagnostics.Add(new ArtifactPublishDiagnostic
                        {
                            ArtifactName = asset.Name,
                            Code = "sidecar-missing-from-blob",
                            Message = "索引生成时未找到已声明的 torrent sidecar blob，已降级为 HTTP-only。",
                            Stage = ArtifactPublishFailureStage.UploadMissing,
                        });
                    }
                }

                indexedAssets.Add(asset);
            }

            versionList.Add(new VersionGroup
            {
                Version = versionGroup.Key,
                Assets = indexedAssets,
                Files = fileProjection,
            });
        }

        var channelsData = BuildChannelsObject(versionList);
        var document = new
        {
            updatedAt = DateTime.UtcNow.ToString("o"),
            versions = versionList,
            channels = channelsData,
        };

        var result = new AzureBlobIndexGenerationResult
        {
            Document = document,
            VersionCount = versionList.Count,
            AssetCount = totalAssets,
            HttpOnlyFallbackCount = httpOnlyFallbackCount,
        };
        result.Diagnostics.AddRange(diagnostics);
        return result;
    }

    private static List<ArtifactDownloadSource> BuildIndexedDownloadSources(
        PublishedArtifactMetadata? metadata,
        string directUrl)
    {
        if (metadata is null)
        {
            return new List<ArtifactDownloadSource>();
        }

        var sources = metadata.DownloadSources.Count > 0
            ? metadata.DownloadSources
            : new List<ArtifactDownloadSource>
            {
                new()
                {
                    Kind = ArtifactDownloadSourceKinds.Official,
                    Label = "Official",
                    Url = directUrl,
                    Primary = true,
                    WebSeed = true,
                }
            };

        return sources
            .Where((source) => !string.IsNullOrWhiteSpace(source.Url))
            .GroupBy((source) => $"{source.Kind}|{source.Url}", StringComparer.OrdinalIgnoreCase)
            .Select((group) => group.First())
            .OrderByDescending((source) => source.Primary)
            .ThenBy((source) => source.Kind, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static List<string> BuildIndexedWebSeeds(
        PublishedArtifactMetadata? metadata,
        IReadOnlyCollection<ArtifactDownloadSource> downloadSources,
        string directUrl)
    {
        if (metadata is null)
        {
            return new List<string>();
        }

        var seeds = metadata.WebSeeds
            .Concat(downloadSources.Where((source) => source.WebSeed).Select((source) => source.Url))
            .Where((url) => !string.IsNullOrWhiteSpace(url))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (seeds.Count == 0)
        {
            seeds.Add(directUrl);
        }

        return seeds;
    }

    private static string SerializeJson(object value, bool minify)
    {
        var jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = !minify,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        return JsonSerializer.Serialize(value, jsonOptions);
    }

    private static bool TryValidateRequiredString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;

        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var stringValue = property.GetString();
        if (string.IsNullOrWhiteSpace(stringValue))
        {
            return false;
        }

        value = stringValue;
        return true;
    }

    private string ExtractChannelFromVersion(string version)
    {
        if (string.IsNullOrWhiteSpace(version))
        {
            return "beta";
        }

        version = version.TrimStart('v', 'V');

        foreach (var (pattern, channel) in _customChannelMapping)
        {
            if (version.Contains(pattern, StringComparison.OrdinalIgnoreCase))
            {
                return channel;
            }
        }

        var dashIndex = version.IndexOf('-');
        if (dashIndex <= 0)
        {
            return "stable";
        }

        var prerelease = version[(dashIndex + 1)..].ToLowerInvariant();
        if (prerelease.StartsWith("beta." ) || prerelease.StartsWith("beta"))
        {
            return "beta";
        }
        if (prerelease.StartsWith("canary.") || prerelease.StartsWith("canary"))
        {
            return "canary";
        }
        if (prerelease.StartsWith("alpha.") || prerelease.StartsWith("alpha"))
        {
            return "alpha";
        }
        if (prerelease.StartsWith("dev.") || prerelease.StartsWith("dev"))
        {
            return "dev";
        }
        if (prerelease.StartsWith("preview.") || prerelease.StartsWith("preview"))
        {
            return "preview";
        }
        if (prerelease.StartsWith("rc.") || prerelease.StartsWith("rc"))
        {
            return "preview";
        }

        return "preview";
    }

    private Dictionary<string, List<string>> GroupVersionsByChannel(List<VersionGroup> versions)
    {
        var channelGroups = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var version in versions)
        {
            var channel = ExtractChannelFromVersion(version.Version);
            if (!channelGroups.ContainsKey(channel))
            {
                channelGroups[channel] = new List<string>();
            }

            channelGroups[channel].Add(version.Version);
        }

        return channelGroups;
    }

    private Dictionary<string, object> BuildChannelsObject(List<VersionGroup> versions)
    {
        var channelGroups = GroupVersionsByChannel(versions);
        var channelsData = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        foreach (var (channelName, versionStrings) in channelGroups)
        {
            Semver.SemVersion? latestVersion = null;
            string? latestVersionString = null;

            foreach (var versionStr in versionStrings)
            {
                if (!SemverExtensions.TryParseVersion(versionStr, out var semver))
                {
                    continue;
                }

                if (latestVersion == null || Semver.SemVersion.ComparePrecedence(semver, latestVersion) > 0)
                {
                    latestVersion = semver;
                    latestVersionString = versionStr;
                }
            }

            if (latestVersionString == null && versionStrings.Count > 0)
            {
                latestVersionString = versionStrings[0];
            }

            channelsData[channelName] = new ChannelInfo
            {
                Latest = latestVersionString ?? string.Empty,
                Versions = versionStrings,
            };
        }

        return channelsData;
    }
}

internal interface IAzureBlobContainerClient
{
    IAzureBlobClient GetBlobClient(string blobName);
    IAsyncEnumerable<AzureBlobInfo> ListBlobsAsync();
}

internal interface IAzureBlobClient
{
    Uri Uri { get; }
    string Name { get; }
    Task<bool> ExistsAsync();
    Task<byte[]?> GetContentHashAsync();
    Task UploadAsync(Stream content);
}

internal sealed class AzureBlobContainerClientAdapter : IAzureBlobContainerClient
{
    private readonly BlobContainerClient _client;

    public AzureBlobContainerClientAdapter(BlobContainerClient client)
    {
        _client = client;
    }

    public IAzureBlobClient GetBlobClient(string blobName)
    {
        return new AzureBlobClientAdapter(_client.GetBlobClient(blobName));
    }

    public async IAsyncEnumerable<AzureBlobInfo> ListBlobsAsync()
    {
        await foreach (var blobItem in _client.GetBlobsAsync())
        {
            yield return new AzureBlobInfo
            {
                Name = blobItem.Name,
                Size = blobItem.Properties.ContentLength ?? 0,
                LastModified = blobItem.Properties.LastModified?.UtcDateTime ?? DateTime.MinValue,
            };
        }
    }
}

internal sealed class AzureBlobClientAdapter : IAzureBlobClient
{
    private readonly BlobClient _client;

    public AzureBlobClientAdapter(BlobClient client)
    {
        _client = client;
    }

    public Uri Uri => _client.Uri;

    public string Name => _client.Name;

    public async Task<bool> ExistsAsync()
    {
        return await _client.ExistsAsync();
    }

    public async Task<byte[]?> GetContentHashAsync()
    {
        if (!await _client.ExistsAsync())
        {
            return null;
        }

        var properties = await _client.GetPropertiesAsync();
        return properties.Value.ContentHash;
    }

    public async Task UploadAsync(Stream content)
    {
        await _client.UploadAsync(content, overwrite: true);
    }
}

public class AzureBlobInfo
{
    public required string Name { get; init; }
    public long Size { get; init; }
    public DateTime LastModified { get; init; }
}

public class VersionGroup
{
    public required string Version { get; init; }
    public List<AzureIndexedAsset> Assets { get; init; } = new();
    public List<string> Files { get; init; } = new();
}

public class AzureIndexedAsset
{
    public required string Name { get; init; }
    public required string Path { get; init; }
    public long Size { get; init; }
    public required string LastModified { get; init; }
    public required string DirectUrl { get; init; }
    public string? TorrentUrl { get; set; }
    public List<string>? WebSeeds { get; set; }
    public List<ArtifactDownloadSource>? DownloadSources { get; set; }
    public string? InfoHash { get; set; }
    public string? Sha256 { get; set; }
}

public class ChannelInfo
{
    public required string Latest { get; init; }
    public List<string> Versions { get; init; } = new();
}
