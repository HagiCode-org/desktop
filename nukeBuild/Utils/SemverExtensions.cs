using Semver.Comparers;

namespace Utils;

/// <summary>
/// Extension methods for Semver.SemVersion to simplify common version operations
/// </summary>
public static class SemverExtensions
{
    /// <summary>
    /// Tries to parse a version string, handling common edge cases like 'v' prefix and null/empty values
    /// </summary>
    /// <param name="version">The version string to parse (e.g., "1.2.3", "v1.2.3", "1.2.3-beta.1")</param>
    /// <param name="semver">When this method returns, contains the parsed Semver.SemVersion if successful; otherwise, null</param>
    /// <returns>True if the version was successfully parsed; false otherwise</returns>
    /// <remarks>
    /// This method handles:
    /// - 'v' or 'V' prefix (e.g., "v1.2.3" -> "1.2.3")
    /// - null or empty strings (returns false)
    /// - Valid SemVer 2.0.0 versions including prerelease and build metadata
    /// </remarks>
    public static bool TryParseVersion(string version, out Semver.SemVersion semver)
    {
        semver = null;

        if (string.IsNullOrWhiteSpace(version))
        {
            return false;
        }

        // Remove 'v' or 'V' prefix if present
        var normalizedVersion = version.TrimStart('v', 'V');

        // Use Semver library for parsing
        
        return Semver.SemVersion.TryParse(normalizedVersion, out semver);
    }

    /// <summary>
    /// Checks if this version is newer than the specified version string
    /// </summary>
    /// <param name="version">The current version</param>
    /// <param name="other">The version string to compare against</param>
    /// <returns>True if this version is newer than the other version; false otherwise</returns>
    /// <exception cref="ArgumentNullException">Thrown when other is null or empty</exception>
    /// <exception cref="InvalidOperationException">Thrown when other cannot be parsed as a valid SemVer version</exception>
    public static bool IsNewerThan(this Semver.SemVersion version, string other)
    {
        if (string.IsNullOrWhiteSpace(other))
        {
            throw new ArgumentNullException(nameof(other), "Version string cannot be null or empty");
        }

        if (!TryParseVersion(other, out var otherVersion))
        {
            throw new InvalidOperationException($"Invalid Semver version: {other}");
        }

        return Semver.SemVersion.ComparePrecedence(version, otherVersion) > 0;
    }

    /// <summary>
    /// Checks if this version is newer than or equal to the specified version string
    /// </summary>
    /// <param name="version">The current version</param>
    /// <param name="other">The version string to compare against</param>
    /// <returns>True if this version is newer than or equal to the other version; false otherwise</returns>
    /// <exception cref="ArgumentNullException">Thrown when other is null or empty</exception>
    /// <exception cref="InvalidOperationException">Thrown when other cannot be parsed as a valid SemVer version</exception>
    public static bool IsNewerOrEqualThan(this Semver.SemVersion version, string other)
    {
        if (string.IsNullOrWhiteSpace(other))
        {
            throw new ArgumentNullException(nameof(other), "Version string cannot be null or empty");
        }

        if (!TryParseVersion(other, out var otherVersion))
        {
            throw new InvalidOperationException($"Invalid Semver version: {other}");
        }

        return Semver.SemVersion.ComparePrecedence(version, otherVersion) >= 0;
    }

    /// <summary>
    /// Determines the release channel based on the version's prerelease identifiers
    /// </summary>
    /// <param name="version">The version to classify</param>
    /// <returns>The VersionChannel based on prerelease identifiers:
    /// - Stable: No prerelease identifier
    /// - Beta: Prerelease identifier starts with "beta"
    /// - Preview: Prerelease identifier starts with "alpha", "rc", "pre", "preview", or any other prerelease type</returns>
    public static VersionChannel GetChannel(this Semver.SemVersion version)
    {
        // Check if version has prerelease identifiers
        if (!version.PrereleaseIdentifiers.Any())
        {
            return VersionChannel.Stable;
        }

        // Get the first prerelease identifier
        var firstIdentifier = version.PrereleaseIdentifiers.First().ToString();

        // Check for beta identifier
        if (firstIdentifier.StartsWith("beta", StringComparison.OrdinalIgnoreCase))
        {
            return VersionChannel.Beta;
        }

        // Check for preview/alpha/rc/pre identifiers
        if (firstIdentifier.StartsWith("preview", StringComparison.OrdinalIgnoreCase) ||
            firstIdentifier.StartsWith("alpha", StringComparison.OrdinalIgnoreCase) ||
            firstIdentifier.StartsWith("rc", StringComparison.OrdinalIgnoreCase) ||
            firstIdentifier.StartsWith("pre", StringComparison.OrdinalIgnoreCase))
        {
            return VersionChannel.Preview;
        }

        // Other prerelease types default to preview
        return VersionChannel.Preview;
    }
}
