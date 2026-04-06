using Nuke.Common.IO;

/// <summary>
/// Build configuration values
/// </summary>
internal static class BuildConfig
{
    internal const string DefaultGitHubReleaseRepository = "HagiCode-org/desktop";
    internal const string DesktopPublicBaseUrl = "https://desktop.dl.hagicode.com";

    /// <summary>
    /// The release packaged directory path
    /// </summary>
    internal static AbsolutePath ReleasePackagedDirectory => NukeBuild.RootDirectory / "artifacts" / "packages";

    /// <summary>
    /// The current version
    /// Can be set dynamically from release tags
    /// </summary>
    internal static string Version { get; set; } = "1.0.0";

    /// <summary>
    /// The release channel
    /// </summary>
    internal static string ReleaseChannel { get; set; } = "beta";

    internal static string NormalizeGitHubRepository(string? repository)
    {
        var value = repository?.Trim();
        return string.IsNullOrWhiteSpace(value)
            ? DefaultGitHubReleaseRepository
            : value.Trim('/');
    }

    internal static string ResolveGitHubReleaseRepositoryName(string? repository)
    {
        var value = NormalizeGitHubRepository(repository);

        var segments = value.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return segments.Length == 0 ? value : segments[^1];
    }
}
