using System.Text.Json;

namespace AzureStorage;

internal static class ReleasePublishSummaryArtifacts
{
    public static async Task WriteAsync(string path, ReleasePublishSummary summary)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(summary, CreateJsonOptions(indented: true)));
    }

    public static async Task<ReleasePublishSummary> MergeAsync(MergedPublishResultsManifest manifest)
    {
        var expectedShardIds = manifest.ExpectedShardIds
            .Where((id) => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var mergedSummary = new ReleasePublishSummary
        {
            ShardId = "finalize",
        };
        var seenShardIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenArtifactPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var resultFile in manifest.ResultFiles.Where((path) => !string.IsNullOrWhiteSpace(path)))
        {
            if (!File.Exists(resultFile))
            {
                throw new InvalidOperationException($"缺少 shard 发布结果文件: {resultFile}");
            }

            var shardSummary = await ReadAsync<ReleasePublishSummary>(resultFile);
            if (shardSummary is null)
            {
                throw new InvalidOperationException($"shard 发布结果不是有效 JSON: {resultFile}");
            }

            if (string.IsNullOrWhiteSpace(shardSummary.ShardId))
            {
                throw new InvalidOperationException($"shard 发布结果缺少 shardId: {resultFile}");
            }

            if (expectedShardIds.Count > 0 && !expectedShardIds.Contains(shardSummary.ShardId, StringComparer.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"shard 发布结果与计划不匹配: {shardSummary.ShardId}");
            }

            if (!seenShardIds.Add(shardSummary.ShardId))
            {
                throw new InvalidOperationException($"发现重复的 shard 发布结果: {shardSummary.ShardId}");
            }

            if (!shardSummary.Success)
            {
                throw new InvalidOperationException($"shard 发布失败，阻止根索引上传: {shardSummary.ShardId}");
            }

            mergedSummary.EligibleAssetCount += shardSummary.EligibleAssetCount;
            mergedSummary.SidecarSuccessCount += shardSummary.SidecarSuccessCount;
            mergedSummary.HttpOnlyFallbackCount += shardSummary.HttpOnlyFallbackCount;
            mergedSummary.UploadedBlobCount += shardSummary.UploadedBlobCount;
            mergedSummary.SkippedBlobCount += shardSummary.SkippedBlobCount;
            mergedSummary.MissingBlobCount += shardSummary.MissingBlobCount;
            mergedSummary.Diagnostics.AddRange(shardSummary.Diagnostics);
            mergedSummary.UploadedBlobNames.AddRange(shardSummary.UploadedBlobNames);
            mergedSummary.SkippedBlobNames.AddRange(shardSummary.SkippedBlobNames);
            mergedSummary.MissingBlobNames.AddRange(shardSummary.MissingBlobNames);

            foreach (var artifact in shardSummary.PublishedArtifacts)
            {
                if (seenArtifactPaths.Add(artifact.Path))
                {
                    mergedSummary.PublishedArtifacts.Add(artifact);
                }
            }
        }

        var missingShardIds = expectedShardIds
            .Where((id) => !seenShardIds.Contains(id))
            .OrderBy((id) => id, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (missingShardIds.Count > 0)
        {
            throw new InvalidOperationException($"缺少 shard 发布结果: {string.Join(", ", missingShardIds)}");
        }

        mergedSummary.Success = true;
        return mergedSummary;
    }

    public static async Task<T?> ReadAsync<T>(string path)
    {
        if (!File.Exists(path))
        {
            return default;
        }

        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<T>(stream, CreateJsonOptions(indented: true));
    }

    private static JsonSerializerOptions CreateJsonOptions(bool indented)
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            WriteIndented = indented,
        };
    }
}
