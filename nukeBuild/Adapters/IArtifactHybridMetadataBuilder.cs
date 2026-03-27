using AzureStorage;

namespace Adapters;

public interface IArtifactHybridMetadataBuilder
{
    Task<ArtifactMetadataBuildResult> BuildAsync(IEnumerable<string> filePaths, string versionPrefix, string containerBaseUrl);
}
