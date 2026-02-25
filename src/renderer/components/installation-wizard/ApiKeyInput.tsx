import React, { useState } from 'react';

interface ApiKeyInputProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * ApiKeyInput component for entering Claude API key
 */
export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({
  onSubmit,
  onCancel,
  isLoading = false,
  error = null,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      onSubmit(apiKey.trim());
    }
  };

  return (
    <div className="api-key-input">
      <h3>Enter Claude API Key</h3>
      <p className="description">
        To use the AI-powered installation feature, you need to provide a Claude API key.
        You can get one from{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.electronAPI.openExternal('https://www.anthropic.com/settings/api-keys');
          }}
        >
          Anthropic Console
        </a>
      </p>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            disabled={isLoading}
          />
          <button
            type="button"
            className="toggle-visibility"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!apiKey.trim() || isLoading}>
            {isLoading ? 'Validating...' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApiKeyInput;
