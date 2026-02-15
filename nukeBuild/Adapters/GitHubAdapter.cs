using System.Diagnostics;

namespace Adapters;

public class GitHubAdapter
{
    private readonly AbsolutePath _rootDirectory;

    public GitHubAdapter(AbsolutePath rootDirectory)
    {
        _rootDirectory = rootDirectory;
    }

    public async Task<string?> GetLatestReleaseTagUsingGhAsync()
    {
        try
        {
            Log.Information("使用 gh CLI 获取最新 release tag...");

            var psi = new ProcessStartInfo
            {
                FileName = "gh",
                Arguments = "release view --json tagName -q .tagName",
                RedirectStandardOutput = true,
                UseShellExecute = true,
                CreateNoWindow = true
            };

            using var process = new System.Diagnostics.Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true
            };

            process.Start();
            await process.WaitForExitAsync();

            var output = await process.StandardOutput.ReadToEndAsync();
            var error = await process.StandardError.ReadToEndAsync();

            if (process.ExitCode != 0)
            {
                Log.Error("gh CLI 失败，退出码: {Code}", process.ExitCode);
                if (!string.IsNullOrWhiteSpace(error))
                {
                    Log.Error("错误输出: {Error}", error);
                }
                return null;
            }

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

    public async Task<List<GitHubReleaseAsset>?> GetReleaseAssetsAsync(string tag)
    {
        try
        {
            Log.Information("使用 gh CLI 获取 release 资产: {Tag}...", tag);

            var psi = new ProcessStartInfo
            {
                FileName = "gh",
                Arguments = $"release view {tag} --json assets -q",
                RedirectStandardOutput = true,
                UseShellExecute = true,
                CreateNoWindow = true
            };

            using var process = new System.Diagnostics.Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true
            };

            process.Start();
            
            var output = new List<GitHubReleaseAsset>();
            var outputReader = new System.IO.StreamReader(process.StandardOutput.BaseStream);
            string? line;

            while ((line = await outputReader.ReadLineAsync()) != null)
            {
                if (line.TrimStart().StartsWith("{"))
                {
                    try
                    {
                        var json = System.Text.Json.JsonDocument.Parse(line);
                        var root = json.RootElement;

                        if (root.TryGetProperty("assets", out var assetsElement))
                        {
                            foreach (var asset in assetsElement.EnumerateArray())
                            {
                                if (asset.TryGetProperty("name", out var nameElement) &&
                                    asset.TryGetProperty("size", out var sizeElement) &&
                                    asset.TryGetProperty("browser_download_url", out var urlElement))
                                {
                                    var name = nameElement.GetString();
                                    var size = sizeElement.GetInt64();
                                    var downloadUrl = urlElement.GetString();

                                    output.Add(new GitHubReleaseAsset
                                    {
                                        Name = name,
                                        Size = size,
                                        DownloadUrl = downloadUrl
                                    });
                                }
                            }
                        }
                    }
                catch (System.Text.Json.JsonException)
                    {
                    // Skip non-JSON lines
                    }
                }
            }

            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                Log.Error("gh CLI 失败，退出码: {Code}", process.ExitCode);
                return null;
            }

            Log.Information("找到 {Count} 个 release 资产", output.Count);
            return output;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "使用 gh CLI 获取 release 资产失败");
            return null;
        }
    }
}

public class GitHubReleaseAsset
{
    public required string Name { get; init; }
    public required string DownloadUrl { get; init; }
    public long Size { get; init; }
}
