using Nuke.Common.IO;

/// <summary>
/// Build configuration values
/// </summary>
internal static class BuildConfig
{
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
}
