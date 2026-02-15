using System.Collections.Generic;
using System.Text.Json;

namespace AzureStorage;

#region Azure Blob Storage Configuration

/// <summary>
/// Azure Blob Storage publish result
/// </summary>
public class AzureBlobPublishResult
{
    public bool Success { get; set; }
    public List<string> UploadedBlobs { get; set; } = new();
    public string ErrorMessage { get; set; } = string.Empty;
    public List<string> Warnings { get; set; } = new();
}

/// <summary>
/// Azure Blob Storage publish options
/// </summary>
public class AzureBlobPublishOptions
{
    /// <summary>
    /// Azure Blob SAS URL for authentication and upload
    /// Format: https://<account>.blob.core.windows.net/<container>?<sas-token>
    /// </summary>
    public string SasUrl { get; set; } = string.Empty;

    /// <summary>
    /// Automatically generate index.json index file
    /// </summary>
    public bool GenerateIndex { get; set; } = true;

    /// <summary>
    /// Upload retry count
    /// </summary>
    public int UploadRetries { get; set; } = 3;

    /// <summary>
    /// Versioned directory prefix (e.g., "1.0.0/" or "0.1.0-beta.1/")
    /// Automatically generated from version number
    /// </summary>
    public string VersionPrefix { get; set; } = string.Empty;

    /// <summary>
    /// Container name (parsed from SAS URL)
    /// </summary>
    public string ContainerName { get; set; } = string.Empty;

    /// <summary>
    /// Storage account name (parsed from SAS URL)
    /// </summary>
    public string AccountName { get; set; } = string.Empty;

    /// <summary>
    /// Local index.json output path (for separated mode)
    /// </summary>
    public string LocalIndexPath { get; set; } = string.Empty;
}

#endregion

#region Channel Classification

/// <summary>
/// Channel classification for version management
/// Versions are categorized into channels based on their SemVer prerelease identifiers
/// </summary>
public enum VersionChannel
{
    /// <summary>
    /// Stable releases - production-ready versions without prerelease identifiers
    /// Example: "2.1.0"
    /// </summary>
    Stable,

    /// <summary>
    /// Beta releases - pre-release versions for testing
    /// Identified by "-beta." prerelease identifier
    /// Example: "2.2.0-beta.3"
    /// </summary>
    Beta,

    /// <summary>
    /// Preview releases - early access/alpha versions
    /// Identified by "-preview.", "-alpha.", or other prerelease identifiers
    /// Example: "3.0.0-preview.1"
    /// </summary>
    Preview
}

/// <summary>
/// Helper class for classifying versions into channels
/// </summary>
public static class ChannelClassification
{
    /// <summary>
    /// Classifies a version string into a channel based on its prerelease identifier
    /// </summary>
    /// <param name="version">Version string (e.g., "2.1.0", "2.2.0-beta.3", "3.0.0-preview.1")</param>
    /// <returns>The channel this version belongs to</returns>
    public static VersionChannel ClassifyVersion(string version)
    {
        if (string.IsNullOrWhiteSpace(version))
        {
            return VersionChannel.Stable; // Default to stable for invalid versions
        }

        // Remove 'v' prefix if present
        version = version.TrimStart('v');

        // Check for prerelease identifier
        var dashIndex = version.IndexOf('-');
        if (dashIndex <= 0)
        {
            // No prerelease identifier = stable
            return VersionChannel.Stable;
        }

        var prerelease = version.Substring(dashIndex + 1).ToLowerInvariant();

        // Check for beta identifier
        if (prerelease.StartsWith("beta."))
        {
            return VersionChannel.Beta;
        }

        // Check for preview identifier
        if (prerelease.StartsWith("preview.") ||
            prerelease.StartsWith("alpha.") ||
            prerelease.StartsWith("rc.") ||
            prerelease.StartsWith("pre.") ||
            prerelease.StartsWith("dev.") ||
            prerelease.StartsWith("alpha") ||
            prerelease.StartsWith("dev"))
        {
            return VersionChannel.Preview;
        }

        // Other prerelease types default to preview
        return VersionChannel.Preview;
    }

    /// <summary>
    /// Gets the channel name as a string
    /// </summary>
    /// <param name="channel">Channel enum value</param>
    /// <returns>Channel name as lowercase string</returns>
    public static string GetChannelName(VersionChannel channel)
    {
        return channel switch
        {
            VersionChannel.Stable => "stable",
            VersionChannel.Beta => "beta",
            VersionChannel.Preview => "preview",
            _ => "stable"
        };
    }

    /// <summary>
    /// Parses a channel name string to enum value
    /// </summary>
    /// <param name="channelName">Channel name string (case-insensitive)</param>
    /// <returns>Channel enum value</returns>
    public static VersionChannel ParseChannelName(string channelName)
    {
        return channelName.ToLowerInvariant() switch
        {
            "stable" => VersionChannel.Stable,
            "beta" => VersionChannel.Beta,
            "preview" => VersionChannel.Preview,
            "dev" => VersionChannel.Preview,
            _ => VersionChannel.Stable // Default to stable
        };
    }
}

#endregion

#region Feishu Notification

/// <summary>
/// Feishu notification options
/// </summary>
public class FeishuNotificationOptions
{
    /// <summary>
    /// Feishu webhook URL
    /// </summary>
    public string WebhookUrl { get; set; } = string.Empty;

    /// <summary>
    /// Notification title
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Notification message content (markdown format)
    /// </summary>
    public string Message { get; set; } = string.Empty;

    /// <summary>
    /// Whether the sync was successful
    /// </summary>
    public bool IsSuccess { get; set; }

    /// <summary>
    /// Release tag
    /// </summary>
    public string ReleaseTag { get; set; } = string.Empty;

    /// <summary>
    /// Release channel
    /// </summary>
    public string ReleaseChannel { get; set; } = string.Empty;

    /// <summary>
    /// Number of uploaded files
    /// </summary>
    public int FileCount { get; set; }

    /// <summary>
    /// Azure Storage path
    /// </summary>
    public string StoragePath { get; set; } = string.Empty;

    /// <summary>
    /// GitHub Actions run URL
    /// </summary>
    public string GitHubRunUrl { get; set; } = string.Empty;

    /// <summary>
    /// GitHub SHA
    /// </summary>
    public string GitHubSha { get; set; } = string.Empty;

    /// <summary>
    /// GitHub actor
    /// </summary>
    public string GitHubActor { get; set; } = string.Empty;
}

#endregion
