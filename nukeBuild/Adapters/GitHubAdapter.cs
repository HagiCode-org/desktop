using Utils;

namespace Adapters;

public sealed class GitHubAdapter
{
    private readonly AbsolutePath _rootDirectory;
    private readonly string _gitHubToken;
    private readonly string _gitHubRepository;
    private readonly string _gitHubRepositoryName;

    public GitHubAdapter(AbsolutePath rootDirectory, string gitHubToken, string gitHubRepository)
    {
        _rootDirectory = rootDirectory;
        _gitHubToken = gitHubToken;
        _gitHubRepository = BuildConfig.NormalizeGitHubRepository(gitHubRepository);
        _gitHubRepositoryName = BuildConfig.ResolveGitHubReleaseRepositoryName(_gitHubRepository);
    }

    public async Task<string?> GetLatestReleaseTagUsingGhAsync()
    {
        try
        {
            Log.Information("使用 gh CLI 获取最新 release tag，仓库: {Repository}", _gitHubRepository);
            var output = await RunGhAsync("release", "view", "--repo", _gitHubRepository, "--json", "tagName", "--jq", ".tagName");
            var tag = output.Trim();
            if (string.IsNullOrWhiteSpace(tag))
            {
                Log.Warning("gh CLI 未返回 tag 信息");
                return null;
            }

            Log.Information("GitHub 最新 release tag: {Tag}", tag);
            return tag;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "使用 gh CLI 获取 tag 失败");
            return null;
        }
    }

    public async Task<IReadOnlyList<GitHubReleaseAsset>> GetReleaseAssetsAsync(string tag)
    {
        try
        {
            Log.Information("使用 gh CLI 获取 release 资产: {Tag} ({Repository})", tag, _gitHubRepository);
            var json = await RunGhAsync("api", $"repos/{_gitHubRepository}/releases/tags/{tag}");
            using var document = JsonDocument.Parse(json);

            if (!document.RootElement.TryGetProperty("assets", out var assetsElement) ||
                assetsElement.ValueKind != JsonValueKind.Array)
            {
                Log.Warning("release {Tag} 未返回 assets 数组", tag);
                return Array.Empty<GitHubReleaseAsset>();
            }

            var assets = new List<GitHubReleaseAsset>();
            foreach (var asset in assetsElement.EnumerateArray())
            {
                if (!asset.TryGetProperty("name", out var nameElement) ||
                    nameElement.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                var name = nameElement.GetString();
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                var size = asset.TryGetProperty("size", out var sizeElement) && sizeElement.TryGetInt64(out var parsedSize)
                    ? parsedSize
                    : 0L;

                assets.Add(new GitHubReleaseAsset
                {
                    Name = name,
                    Size = size,
                });
            }

            Log.Information("找到 {Count} 个 release 资产", assets.Count);
            return assets;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "使用 gh CLI 获取 release 资产失败");
            return Array.Empty<GitHubReleaseAsset>();
        }
    }

    public async Task<AzureReleaseUploadPlan> CreateAzureUploadPlanAsync(
        string tag,
        string versionPrefix,
        string releaseChannel,
        int maxParallel)
    {
        var assets = await GetReleaseAssetsAsync(tag);
        var eligibleAssets = new List<ReleaseAssetSelection>();
        var skippedAssets = new List<string>();

        foreach (var asset in assets.OrderBy((item) => item.Name, StringComparer.OrdinalIgnoreCase))
        {
            if (IsGitHubGeneratedSourceArchive(asset.Name, tag, versionPrefix))
            {
                skippedAssets.Add(asset.Name);
                continue;
            }

            eligibleAssets.Add(new ReleaseAssetSelection
            {
                Name = asset.Name,
                Size = asset.Size,
            });
        }

        var shardPlans = eligibleAssets
            .Select((asset, index) => new AzureUploadShardPlan
            {
                ShardId = $"shard-{index + 1:D3}",
                Assets = new List<ReleaseAssetSelection> { asset },
                AssetCount = 1,
                TotalSizeBytes = asset.Size,
            })
            .ToList();

        return new AzureReleaseUploadPlan
        {
            ReleaseTag = tag,
            ReleaseChannel = releaseChannel,
            VersionPrefix = versionPrefix,
            Repository = _gitHubRepository,
            MaxParallel = Math.Max(1, maxParallel),
            EligibleAssets = eligibleAssets,
            SkippedAssets = skippedAssets,
            Shards = shardPlans,
        };
    }

    public async Task DownloadReleaseAssetsAsync(
        string tag,
        AbsolutePath downloadDirectory,
        IReadOnlyCollection<string>? assetNames = null)
    {
        Directory.CreateDirectory(downloadDirectory);

        var arguments = new List<string>
        {
            "release",
            "download",
            tag,
            "--repo",
            _gitHubRepository,
            "--dir",
            downloadDirectory.ToString(),
            "--clobber",
        };

        if (assetNames is { Count: > 0 })
        {
            foreach (var assetName in assetNames
                         .Where((name) => !string.IsNullOrWhiteSpace(name))
                         .Distinct(StringComparer.OrdinalIgnoreCase))
            {
                arguments.Add("--pattern");
                arguments.Add(assetName);
            }

            Log.Information("下载 shard 资产: {Count} 个", assetNames.Count);
        }
        else
        {
            Log.Information("下载 release 的全部资产（后续会过滤自动源码包）");
        }

        _ = await RunGhAsync(arguments.ToArray());
    }

    private bool IsGitHubGeneratedSourceArchive(string assetName, string tag, string versionPrefix)
    {
        return AzureBlobPathUtilities.IsGitHubGeneratedSourceArchive(assetName, _gitHubRepositoryName, tag)
            || AzureBlobPathUtilities.IsGitHubGeneratedSourceArchive(assetName, _gitHubRepositoryName, versionPrefix);
    }

    private async Task<string> RunGhAsync(params string[] arguments)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "gh",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = _rootDirectory.ToString(),
        };

        foreach (var argument in arguments)
        {
            psi.ArgumentList.Add(argument);
        }

        if (!string.IsNullOrWhiteSpace(_gitHubToken))
        {
            psi.Environment["GH_TOKEN"] = _gitHubToken;
        }

        using var process = new Process
        {
            StartInfo = psi,
            EnableRaisingEvents = true,
        };

        process.Start();
        var standardOutput = await process.StandardOutput.ReadToEndAsync();
        var standardError = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
        {
            if (!string.IsNullOrWhiteSpace(standardError))
            {
                Log.Error("gh {Arguments} 失败: {Error}", string.Join(' ', arguments), standardError.Trim());
            }

            throw new InvalidOperationException($"gh {string.Join(' ', arguments)} 失败，退出码: {process.ExitCode}");
        }

        if (!string.IsNullOrWhiteSpace(standardError))
        {
            Log.Debug(standardError.Trim());
        }

        return standardOutput;
    }
}

public sealed class GitHubReleaseAsset
{
    public required string Name { get; init; }
    public long Size { get; init; }
}
