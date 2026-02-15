using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using AzureStorage;
using System.Text.Json;
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
    private Dictionary<string, string> _customChannelMapping;

    public AzureBlobAdapter(AbsolutePath rootDirectory, string channelMappingJson = "")
    {
        _rootDirectory = rootDirectory;
        _customChannelMapping = ParseChannelMapping(channelMappingJson);
    }

    /// <summary>
    /// Parses custom channel mapping from JSON string
    /// </summary>
    /// <param name="channelMappingJson">JSON string mapping version patterns to channels</param>
    /// <returns>Dictionary of version patterns to channel names</returns>
    private static Dictionary<string, string> ParseChannelMapping(string channelMappingJson)
    {
        if (string.IsNullOrWhiteSpace(channelMappingJson))
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

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

    public async Task<bool> ValidateSasUrlAsync(string sasUrl)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(sasUrl))
            {
                Log.Warning("SAS URL is empty");
                return false;
            }

            Log.Information("Validating SAS URL");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "SAS URL validation failed");
            return false;
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

            var containerClient = new BlobContainerClient(new Uri(options.SasUrl));
            Log.Information("Container: {Container}", options.ContainerName);
            Log.Information("Version prefix: {Prefix}", options.VersionPrefix ?? "(none)");

            foreach (var filePath in filePaths)
            {
                if (!File.Exists(filePath))
                {
                    Log.Warning("File not found: {Path}", filePath);
                    continue;
                }

                var fileName = Path.GetFileName(filePath);
                var versionPrefix = options.VersionPrefix;
                if (!string.IsNullOrEmpty(versionPrefix) && !versionPrefix.EndsWith("/"))
                {
                    versionPrefix += "/";
                }

                var blobName = string.IsNullOrEmpty(versionPrefix)
                    ? fileName
                    : $"{versionPrefix}{fileName}";

                var blobClient = containerClient.GetBlobClient(blobName);

                // Check if blob exists and compare hashes to skip unnecessary uploads
                bool shouldUpload = true;
                if (await blobClient.ExistsAsync())
                {
                    var properties = await blobClient.GetPropertiesAsync();
                    var remoteHash = properties.Value.ContentHash;

                    // Calculate local file hash
                    byte[] localHash;
                    await using (var stream = File.OpenRead(filePath))
                    using (var md5 = MD5.Create())
                    {
                        localHash = await md5.ComputeHashAsync(stream);
                    }

                    // Compare hashes
                    if (remoteHash != null && localHash.SequenceEqual(remoteHash))
                    {
                        Log.Information("Skipping {File} (unchanged, hash: {Hash})", fileName, Convert.ToHexString(localHash)[..8]);
                        shouldUpload = false;
                        result.SkippedBlobs.Add(blobClient.Uri.ToString());
                    }
                }

                if (shouldUpload)
                {
                    Log.Information("Uploading: {File} -> {Container}/{Blob}", fileName, options.ContainerName, blobName);

                    await using var stream = File.OpenRead(filePath);
                    await blobClient.UploadAsync(stream, overwrite: true);
                    var blobUrl = blobClient.Uri.ToString();
                    result.UploadedBlobs.Add(blobUrl);
                    Log.Information("Upload successful: {Url}", blobUrl);
                }
            }

            result.Success = true;
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.ErrorMessage = ex.Message;
            Log.Error(ex, "Azure Blob upload failed");
        }

        return result;
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

            var indexData = new
            {
                version = "1.0.0",
                channel = "beta",
                createdAt = DateTime.UtcNow.ToString("o"),
                files = new List<object>()
            };

            var jsonOptions = new JsonSerializerOptions
            {
                WriteIndented = !minify,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            var jsonContent = JsonSerializer.Serialize(indexData, jsonOptions);

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

            if (!root.TryGetProperty("version", out _) && 
                !root.TryGetProperty("files", out _))
            {
                Log.Warning("Index.json may be missing expected properties");
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

            var containerClient = new BlobContainerClient(new Uri(options.SasUrl));
            var blobClient = containerClient.GetBlobClient("index.json");

            Log.Information("Uploading index.json to Azure Blob Storage...");

            await using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(indexJson));
            await blobClient.UploadAsync(stream, overwrite: true);

            Log.Information("index.json uploaded successfully: {Url}", blobClient.Uri);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to upload index.json");
            return false;
        }
    }

    /// <summary>
    /// List all blobs in the container
    /// </summary>
    public async Task<List<AzureBlobInfo>> ListBlobsAsync(AzureBlobPublishOptions options)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(options.SasUrl))
            {
                Log.Error("SAS URL is required to list blobs");
                return new List<AzureBlobInfo>();
            }

            var containerClient = new BlobContainerClient(new Uri(options.SasUrl));
            var blobs = new List<AzureBlobInfo>();

            Log.Information("Listing blobs in container: {Container}", options.ContainerName);

            await foreach (var blobItem in containerClient.GetBlobsAsync())
            {
                if (blobItem.Name == "index.json")
                {
                    continue;
                }

                blobs.Add(new AzureBlobInfo
                {
                    Name = blobItem.Name,
                    Size = blobItem.Properties.ContentLength ?? 0,
                    LastModified = blobItem.Properties.LastModified.HasValue
                        ? blobItem.Properties.LastModified.Value.DateTime
                        : DateTime.MinValue
                });
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

    /// <summary>
    /// Generate index.json from all blobs in Azure Storage
    /// Groups files by version prefix and creates structured index
    /// </summary>
    public async Task<string> GenerateIndexFromBlobsAsync(AzureBlobPublishOptions options, string outputPath, bool minify = false)
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

            var versionGroups = new Dictionary<string, List<AzureBlobInfo>>();
            foreach (var blob in blobs)
            {
                var version = "latest";
                var slashIndex = blob.Name.IndexOf('/');
                
                if (slashIndex > 0)
                {
                    version = blob.Name.Substring(0, slashIndex);
                }

                if (!versionGroups.ContainsKey(version))
                {
                    versionGroups[version] = new List<AzureBlobInfo>();
                }
                versionGroups[version].Add(blob);
            }

            var versionList = versionGroups
                .OrderByDescending(kv => kv.Key)
                .Select(kv =>
                {
                    var versionFiles = kv.Value.Select(blob =>
                        new
                        {
                            name = Path.GetFileName(blob.Name),
                            path = blob.Name,
                            size = blob.Size,
                            lastModified = blob.LastModified.ToString("o")
                        })
                    .ToList();

                    return new VersionGroup
                    {
                        Version = kv.Key,
                        Files = versionFiles.Cast<object>().ToList()
                    };
                })
                .ToList();

            // Build channels object
            var channelsData = BuildChannelsObject(versionList);

            var indexData = new
            {
                updatedAt = DateTime.UtcNow.ToString("o"),
                versions = versionList,
                channels = channelsData
            };

            var jsonOptions = new JsonSerializerOptions
            {
                WriteIndented = !minify,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            var jsonContent = JsonSerializer.Serialize(indexData, jsonOptions);

            await File.WriteAllTextAsync(outputPath, jsonContent);

            var versionCount = versionList.Count;
            var totalFiles = versionList.Sum(v => v.Files.Count);

            Log.Information("✅ Index.json generated at: {Path}", outputPath);
            Log.Information("   Versions: {Count}", versionCount);
            Log.Information("   Total files: {Count}", totalFiles);
            Log.Information("=== index.json Content ===");
            Log.Information(jsonContent);
            Log.Information("=== End of index.json ===");

            return jsonContent;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to generate index from blobs");
            return string.Empty;
        }
    }

    /// <summary>
    /// Extracts channel name from version string
    /// - No dash (-) = stable (正式版), e.g., "1.0.0", "2.3.1"
    /// - With dash (-) = check prerelease identifier for channel
    /// </summary>
    /// <param name="version">Version string (e.g., "1.0.0", "0.1.0-beta.11")</param>
    /// <returns>Channel name as string</returns>
    private string ExtractChannelFromVersion(string version)
    {
        if (string.IsNullOrWhiteSpace(version))
            return "beta";

        // Remove 'v' prefix if present
        version = version.TrimStart('v', 'V');

        // Check custom channel mapping first
        foreach (var (pattern, channel) in _customChannelMapping)
        {
            if (version.Contains(pattern, StringComparison.OrdinalIgnoreCase))
                return channel;
        }

        // Check for dash (-) to determine if it's a stable release
        var dashIndex = version.IndexOf('-');
        if (dashIndex <= 0)
        {
            // No prerelease identifier = stable (正式版)
            return "stable";
        }

        // Has prerelease identifier - determine channel
        var prerelease = version.Substring(dashIndex + 1).ToLowerInvariant();

        if (prerelease.StartsWith("beta.") || prerelease.StartsWith("beta"))
            return "beta";
        if (prerelease.StartsWith("canary.") || prerelease.StartsWith("canary"))
            return "canary";
        if (prerelease.StartsWith("alpha.") || prerelease.StartsWith("alpha"))
            return "alpha";
        if (prerelease.StartsWith("dev.") || prerelease.StartsWith("dev"))
            return "dev";
        if (prerelease.StartsWith("preview.") || prerelease.StartsWith("preview"))
            return "preview";
        if (prerelease.StartsWith("rc.") || prerelease.StartsWith("rc"))
            return "preview";

        // Other prerelease types default to preview
        return "preview";
    }

    /// <summary>
    /// Groups versions by their channel
    /// </summary>
    /// <param name="versions">List of version groups</param>
    /// <returns>Dictionary mapping channel names to list of version strings</returns>
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

    /// <summary>
    /// Builds the channels object for index.json
    /// Contains latest version and versions array for each channel
    /// </summary>
    /// <param name="versions">List of version groups</param>
    /// <returns>Dictionary mapping channel names to channel information</returns>
    private Dictionary<string, object> BuildChannelsObject(List<VersionGroup> versions)
    {
        var channelGroups = GroupVersionsByChannel(versions);
        var channelsData = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        foreach (var (channelName, versionStrings) in channelGroups)
        {
            // Parse versions and find the latest using Semver precedence comparison
            Semver.SemVersion latestVersion = null;
            string latestVersionString = null;

            foreach (var versionStr in versionStrings)
            {
                if (SemverExtensions.TryParseVersion(versionStr, out var semver))
                {
                    if (latestVersion == null ||
                        Semver.SemVersion.ComparePrecedence(semver, latestVersion) > 0)
                    {
                        latestVersion = semver;
                        latestVersionString = versionStr;
                    }
                }
            }

            // Fallback to first version string if no valid Semver found
            if (latestVersionString == null && versionStrings.Count > 0)
            {
                latestVersionString = versionStrings[0];
            }

            channelsData[channelName] = new ChannelInfo
            {
                Latest = latestVersionString ?? "",
                Versions = versionStrings
            };
        }

        return channelsData;
    }
}

/// <summary>
/// Azure blob information
/// </summary>
public class AzureBlobInfo
{
    public required string Name { get; init; }
    public long Size { get; init; }
    public DateTime LastModified { get; init; }
}

/// <summary>
/// Version group for index.json generation
/// </summary>
public class VersionGroup
{
    public required string Version { get; init; }
    public List<object> Files { get; init; } = new();
}

/// <summary>
/// Channel information for index.json
/// </summary>
public class ChannelInfo
{
    public required string Latest { get; init; }
    public List<string> Versions { get; init; } = new();
}
