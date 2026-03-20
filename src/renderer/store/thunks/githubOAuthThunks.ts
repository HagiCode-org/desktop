import { fetchGitHubOAuthConfig } from '../slices/githubOAuthSlice';

export const initializeGitHubOAuth = () => {
  return async (dispatch: any) => {
    try {
      await dispatch(fetchGitHubOAuthConfig());
    } catch (error) {
      console.error('[GitHubOAuth] Failed to initialize GitHub OAuth configuration:', error);
    }
  };
};
