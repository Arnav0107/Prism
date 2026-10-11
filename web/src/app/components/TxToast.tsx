import React from 'react';
import { useApp } from '../context/AppContext';
import './TxToast.css';

export const TxToast: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="prism-toast-container font-mono" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`prism-toast prism-toast--${t.type}`}>
          <div className="prism-toast__header">
            <span className="prism-toast__status-icon" aria-hidden="true">
              {t.type === 'pending' ? '⋯' : t.type === 'success' ? '✓' : '!'}
            </span>
            <strong className="prism-toast__title">{t.title}</strong>
            <button
              type="button"
              className="prism-toast__close-btn"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss toast"
            >
              ×
            </button>
          </div>

          {t.message && <p className="prism-toast__message">{t.message}</p>}

          {t.hash && (
            <div className="prism-toast__hash font-mono">
              <span className="prism-toast__hash-label">TX:</span>
              <span className="prism-toast__hash-val" title={t.hash}>
                {t.hash.slice(0, 10)}...{t.hash.slice(-8)}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
