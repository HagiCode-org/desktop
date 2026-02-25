import React from 'react';

interface UserConfirmationProps {
  statusMessage: string;
  onConfirm: () => void;
  onRetry: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * UserConfirmation component displays the API call result and allows user to confirm or retry
 */
export const UserConfirmation: React.FC<UserConfirmationProps> = ({
  statusMessage,
  onConfirm,
  onRetry,
  onCancel,
  isLoading = false,
}) => {
  return (
    <div className="user-confirmation">
      <h3>Confirmation</h3>
      <div className="status-message">
        <p>{statusMessage}</p>
      </div>

      <div className="actions">
        <button type="button" className="btn-secondary" onClick={onRetry} disabled={isLoading}>
          Re-check
        </button>
        <button type="button" className="btn-primary" onClick={onConfirm} disabled={isLoading}>
          Complete
        </button>
      </div>

      <div className="cancel-link">
        <button type="button" className="btn-link" onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default UserConfirmation;
