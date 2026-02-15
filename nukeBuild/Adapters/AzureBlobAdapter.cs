using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using AzureStorage;
using System.Text.Json;

namespace Adapters;

/// <summary>
/// Azure Blob Storage adapter implementation
/// Uses SAS URL for authentication and upload
/// </summary>
public class AzureBlobAdapter : IAzureBlobAdapter
{
    private readonly AbsolutePath _rootDirectory;

    public AzureBlobAdapter(AbsolutePath rootDirectory)
    {
        _rootDirectory = rootDirectory;
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
                Log.Information("Uploading: {File} -> {Container}/{Blob}", fileName, options.ContainerName, blobName);

                await using var stream = File.OpenRead(filePath);
                await blobClient.UploadAsync(stream, overwrite: true);
                var blobUrl = blobClient.Uri.ToString();
                result.UploadedBlobs.Add(blobUrl);
                Log.Information("Upload successful: {Url}", blobUrl);
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
                WriteIndented = !minify
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

                    return new
                    {
                        version = kv.Key,
                        files = versionFiles
                    };
                })
                .ToList();

            var indexData = new
            {
                updatedAt = DateTime.UtcNow.ToString("o"),
                versions = versionList
            };

            var jsonOptions = new JsonSerializerOptions
            {
                WriteIndented = !minify
            };

            var jsonContent = JsonSerializer.Serialize(indexData, jsonOptions);

            await File.WriteAllTextAsync(outputPath, jsonContent);

            var versionCount = versionList.Count;
            var totalFiles = versionList.Sum(v => v.files.Count);

            Log.Information("✅ Index.json generated at: {Path}", outputPath);
            Log.Information("   Versions: {Count}", versionCount);
            Log.Information("   Total files: {Count}", totalFiles);

            return jsonContent;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to generate index from blobs");
            return string.Empty;
        }
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
