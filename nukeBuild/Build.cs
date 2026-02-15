using Nuke.Common.CI.GitHubActions;

[GitHubActions(
    "sync-azure-storage",
    GitHubActionsImage.UbuntuLatest,
    InvokedTargets = new[] { nameof(Default) },
    ImportSecrets = new[]
    {
        nameof(AzureBlobSasUrl),
        nameof(GitHubToken)
    },
    EnableGitHubToken = true,
    AutoGenerate = false)]
[ShutdownDotNetAfterServerBuild]
partial class Build : NukeBuild
{
    public static int Main() => Execute<Build>();

    #region Parameters

    [Parameter("Verbose logging")] readonly bool Verbose = false;

    #endregion

    #region Azure Blob Storage Parameters

    [Parameter("Azure Blob SAS URL for authentication and upload")]
    [Secret] readonly string AzureBlobSasUrl = "";

    [Parameter("Skip Azure Blob publish")] readonly bool SkipAzureBlobPublish = false;

    [Parameter("Generate Azure index.json")] readonly bool AzureGenerateIndex = true;

    [Parameter("Azure upload retries")] readonly int AzureUploadRetries = 3;

    [Parameter("Minify index.json uploaded to Azure (default: true)")]
    readonly bool MinifyIndexJson = true;

    [Parameter("Azure index output path")]
    readonly string AzureIndexOutputPath = "";

    [Parameter("Enable artifacts upload")]
    readonly bool UploadArtifacts = true;

    [Parameter("Enable index.json upload (default: true)")]
    readonly bool UploadIndex = true;

    #endregion

    #region Sync Parameters

    [Parameter("GitHub Token for API access")]
    [Secret] readonly string GitHubToken = "";

    [Parameter("Release tag to sync (e.g., v1.0.0)")]
    readonly string ReleaseTag = "";

    [Parameter("Release channel (stable, beta, dev)")]
    readonly string ReleaseChannel = "beta";

    [Parameter("Custom channel mapping (JSON format)")]
    readonly string ChannelMapping = "";

    [Parameter("Feishu webhook URL for notifications")]
    [Secret] readonly string FeishuWebhookUrl = "";

    [Parameter("GitHub Actions run URL")]
    readonly string GitHubRunUrl = "";

    [Parameter("GitHub SHA")]
    readonly string GitHubSha = "";

    [Parameter("GitHub actor")]
    readonly string GitHubActor = "";

    #endregion

    #region Targets

    Target Setup => _ => _
        .Executes(() =>
        {
            Log.Information("Setup completed");
        });

    /// <summary>
    /// Generate Azure Index target
    /// Generates Azure Blob Storage index.json file locally
    /// Dependencies: None
    /// Usage: For CI/CD scenarios where index.json is managed independently
    /// </summary>
    Target GenerateAzureIndex => _ => _
        .Description("Generate Azure Blob Storage index.json locally")
        .Executes(async () => await ExecuteGenerateAzureIndex());

    /// <summary>
    /// Publish to Azure Blob target
    /// Uploads pre-generated index.json to Azure Blob Storage
    /// Dependencies: GenerateAzureIndex
    /// Usage: For CI/CD scenarios where index.json is managed independently
    /// </summary>
    Target PublishToAzureBlob => _ => _
        .Description("Upload pre-generated index.json to Azure Blob Storage")
        .DependsOn(GenerateAzureIndex)
        .Executes(async () => await ExecutePublishToAzureBlob());

    Target Default => _ => _
        .Description("Run complete build process")
        .DependsOn(PublishToAzureBlob);

    #endregion
}
