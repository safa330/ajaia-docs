import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { listShares, revokeShare, shareDocument } from '../lib/api';
import { DEMO_ACCOUNTS } from '../lib/demoAccounts';
import { errorMessage } from '../lib/errors';
import type { Doc, Share, ShareRole } from '../lib/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ShareDialog({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const isOwner = doc.role === 'owner';
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(isOwner);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShares(await listShares(doc.id));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [doc.id]);

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setError('Enter a valid email address.');
      return;
    }
    if (value === doc.owner_email) {
      setError('You already own this document.');
      return;
    }
    void run(async () => {
      await shareDocument(doc.id, value, role);
      setEmail('');
    }, `Shared with ${value} (${role}).`);
  };

  const suggestions = DEMO_ACCOUNTS.filter(
    (account) => account.email !== doc.owner_email && !shares.some((share) => share.email === account.email),
  );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="share-title">{isOwner ? `Share “${doc.title}”` : 'Who can access this document'}</h2>

        {isOwner ? (
          <>
            <p className="hint">
              People you add will find this document under “Shared with me”. Editors can change it; viewers can only read
              it.
            </p>
            <form className="share-form" onSubmit={submit} noValidate>
              <input
                type="email"
                placeholder="name@example.com"
                aria-label="Email address"
                value={email}
                disabled={busy}
                autoFocus
                onChange={(event) => setEmail(event.target.value)}
              />
              <select aria-label="Access level" value={role} disabled={busy} onChange={(event) => setRole(event.target.value as ShareRole)}>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="primary" type="submit" disabled={busy || !email.trim()}>
                Share
              </button>
            </form>
            {suggestions.length > 0 && (
              <p className="hint">
                Demo users:{' '}
                {suggestions.map((account) => (
                  <button key={account.email} type="button" className="link" onClick={() => setEmail(account.email)}>
                    {account.email}
                  </button>
                ))}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {notice && <p className="notice">{notice}</p>}

            <h3 className="section-title">People with access</h3>
            <ul className="share-list">
              <li>
                <div className="who">
                  <span>{doc.owner_email}</span>
                  <small>Owner (you)</small>
                </div>
              </li>
              {loading && <li className="hint">Loading…</li>}
              {!loading && shares.length === 0 && <li className="hint">Not shared with anyone yet.</li>}
              {shares.map((share) => (
                <li key={share.user_id}>
                  <div className="who">
                    <span>{share.email}</span>
                    <small>{share.display_name}</small>
                  </div>
                  <div className="row">
                    <select
                      aria-label={`Access level for ${share.email}`}
                      value={share.role}
                      disabled={busy}
                      onChange={(event) => {
                        const next = event.target.value as ShareRole;
                        void run(() => shareDocument(doc.id, share.email, next), `${share.email} is now ${next === 'editor' ? 'an editor' : 'a viewer'}.`);
                      }}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => void run(() => revokeShare(doc.id, share.user_id), `Removed ${share.email}.`)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            <strong>{doc.owner_name ?? doc.owner_email}</strong> ({doc.owner_email}) owns this document. You have{' '}
            <strong>{doc.role === 'editor' ? 'edit' : 'view-only'}</strong> access. Only the owner can change sharing.
          </p>
        )}

        <div className="modal-footer">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
