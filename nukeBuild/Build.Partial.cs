using Nuke.Common.CI.GitHubActions;

public partial class Build
{
    GitHubActions GitHubActions => GitHubActions.Instance;

    /// <summary>
    /// Gets the GitHub token from CI or parameter
    /// Priority: GitHubActions.Instance.Token (CI) > GitHubToken (parameter)
    /// </summary>
    string EffectiveGitHubToken => GitHubActions?.Token ?? GitHubToken;

    string EffectiveGitHubRepository =>
        BuildConfig.NormalizeGitHubRepository(
            Environment.GetEnvironmentVariable("GITHUB_REPOSITORY") ?? GitHubRepository);
}
