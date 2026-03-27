namespace Utils;

public static class AzureBlobPathUtilities
{
    public static string NormalizeVersionPrefix(string versionPrefix)
    {
        if (string.IsNullOrWhiteSpace(versionPrefix))
        {
            return string.Empty;
        }

        return versionPrefix.Trim().Trim('/').Replace('\\', '/');
    }

    public static string BuildBlobPath(string versionPrefix, string fileName)
    {
        var normalizedPrefix = NormalizeVersionPrefix(versionPrefix);
        var normalizedFileName = fileName.Replace('\\', '/');
        return string.IsNullOrEmpty(normalizedPrefix)
            ? normalizedFileName
            : $"{normalizedPrefix}/{normalizedFileName}";
    }

    public static string BuildContainerBaseUrl(string sasUrl)
    {
        var uri = new Uri(sasUrl);
        return $"{uri.GetLeftPart(UriPartial.Path).TrimEnd('/')}/";
    }

    public static string ResolvePublicBaseUrl(string sasUrl, string publicBaseUrl = "")
    {
        if (!string.IsNullOrWhiteSpace(publicBaseUrl))
        {
            return $"{publicBaseUrl.Trim().TrimEnd('/')}/";
        }

        return BuildContainerBaseUrl(sasUrl);
    }

    public static string BuildBlobUrl(string containerBaseUrl, string blobPath)
    {
        var baseUri = new Uri(containerBaseUrl.EndsWith('/') ? containerBaseUrl : $"{containerBaseUrl}/");
        return new Uri(baseUri, blobPath).ToString();
    }

    public static string ExtractVersion(string blobName)
    {
        var slashIndex = blobName.IndexOf('/');
        return slashIndex > 0 ? blobName[..slashIndex] : "latest";
    }

    public static bool IsGitHubGeneratedSourceArchive(string fileName, string repositoryName, string releaseVersionOrTag)
    {
        if (string.IsNullOrWhiteSpace(fileName) ||
            string.IsNullOrWhiteSpace(repositoryName) ||
            string.IsNullOrWhiteSpace(releaseVersionOrTag))
        {
            return false;
        }

        var normalizedVersion = releaseVersionOrTag.Trim().TrimStart('v', 'V');
        if (string.IsNullOrWhiteSpace(normalizedVersion))
        {
            return false;
        }

        return fileName.Equals($"{repositoryName}-{normalizedVersion}.zip", StringComparison.OrdinalIgnoreCase)
            || fileName.Equals($"{repositoryName}-{normalizedVersion}.tar.gz", StringComparison.OrdinalIgnoreCase);
    }
}
