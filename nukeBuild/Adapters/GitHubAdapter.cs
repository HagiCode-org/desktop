using System.Net.Http;
using System.Text.Json;
using AzureStorage;

namespace Adapters;

/// <summary>
/// GitHub adapter for fetching release information
/// </summary>
public class GitHubAdapter
{
    private readonly string _token;
    private readonly string _repository;

    public GitHubAdapter(string token, string repository)
    {
        _token = token;
        _repository = repository;
    }

    /// <summary>
    /// Fetch the latest release tag from GitHub
    /// </summary>
    public async Task<string?> GetLatestReleaseTagAsync()
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_token))
            {
                Log.Warning("GitHub Token is empty, cannot fetch releases");
                return null;
            }

            if (string.IsNullOrWhiteSpace(_repository))
            {
                Log.Warning("GitHub repository is not specified");
                return null;
            }

            var parts = _repository.Split('/');
            if (parts.Length != 2)
            {
                Log.Error("Invalid repository format. Expected: owner/repo, got: {Repo}", _repository);
                return null;
            }

            var owner = parts[0];
            var repo = parts[1];

            Log.Information("Fetching latest release from {Owner}/{Repo}...", owner, repo);

            using var httpClient = new HttpClient();
            httpClient.DefaultRequestHeaders.Add("User-Agent", "NukeBuild");
            httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_token}");

            var url = $"https://api.github.com/repos/{owner}/{repo}/releases/latest";
            Log.Debug("Request URL: {Url}", url);

            var response = await httpClient.GetAsync(url);
            
            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("Failed to fetch latest release: {StatusCode}", response.StatusCode);
                return null;
            }

            var content = await response.Content.ReadAsStringAsync();
            var json = JsonDocument.Parse(content);

            if (json.RootElement.TryGetProperty("tag_name", out var tagElement))
            {
                var tag = tagElement.GetString();
                Log.Information("Latest release tag: {Tag}", tag);
                return tag;
            }

            Log.Warning("No tag_name found in latest release response");
            return null;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to fetch latest release from GitHub");
            return null;
        }
    }
}
