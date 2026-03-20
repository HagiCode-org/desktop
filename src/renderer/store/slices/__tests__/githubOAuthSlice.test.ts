import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import reducer, {
  fetchGitHubOAuthConfig,
  resetGitHubOAuthForm,
  setClientId,
  setClientSecret,
  toggleSecretVisibility,
  type GitHubOAuthState,
} from '../githubOAuthSlice.js';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/settings/GitHubOAuthSettings.tsx');

const initialState = reducer(undefined, { type: '@@INIT' }) as GitHubOAuthState;

describe('githubOAuthSlice', () => {
  it('initializes from saved data and keeps the secret masked after reload', () => {
    const loaded = reducer(
      initialState,
      fetchGitHubOAuthConfig.fulfilled({
        clientId: 'desktop-client-id',
        clientSecret: 'desktop-client-secret',
        lastUpdated: '2026-03-20T10:00:00.000Z',
        isConfigured: true,
        requiresRestart: true,
      }, 'request-id', undefined)
    );

    assert.equal(loaded.clientId, 'desktop-client-id');
    assert.equal(loaded.clientSecret, 'desktop-client-secret');
    assert.equal(loaded.isSecretVisible, false);
    assert.equal(loaded.requiresRestart, true);
  });

  it('resets the draft form back to the saved credentials', () => {
    const loaded = reducer(
      initialState,
      fetchGitHubOAuthConfig.fulfilled({
        clientId: 'desktop-client-id',
        clientSecret: 'desktop-client-secret',
        lastUpdated: '2026-03-20T10:00:00.000Z',
        isConfigured: true,
        requiresRestart: false,
      }, 'request-id', undefined)
    );

    const dirty = reducer(
      reducer(
        reducer(loaded, setClientId('edited-client-id')),
        setClientSecret('edited-client-secret')
      ),
      toggleSecretVisibility()
    );

    const reset = reducer(dirty, resetGitHubOAuthForm());

    assert.equal(reset.clientId, 'desktop-client-id');
    assert.equal(reset.clientSecret, 'desktop-client-secret');
    assert.equal(reset.isSecretVisible, false);
  });
});

describe('GitHubOAuthSettings source', () => {
  it('renders the secret input as a password field until visibility is toggled', async () => {
    const source = await fs.readFile(componentPath, 'utf-8');

    assert.match(source, /type=\{isSecretVisible \? 'text' : 'password'\}/);
    assert.match(source, /dispatch\(toggleSecretVisibility\(\)\)/);
  });
});
