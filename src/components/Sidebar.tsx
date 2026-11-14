import { useRef, useState, type ChangeEvent } from 'react';
import { generateJSON } from '@tiptap/react';
import { createBaseExtensions } from '../lib/editorExtensions';
import { ACCEPT_ATTRIBUTE, SUPPORTED_LABEL, importFile } from '../lib/importFile';
import { errorMessage } from '../lib/errors';
import { supabase } from '../lib/supabase';
import type { DocSummary, NewDocumentInput } from '../lib/types';

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface Props {
  docs: DocSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  email: string;
  onSelect: (id: string) => void;
  onCreate: (input?: NewDocumentInput) => Promise<void>;
  onRefresh: () => void;
}

export default function Sidebar({ docs, loading, error, selectedId, email, onSelect, onCreate, onRefresh }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'new' | 'import' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const owned = docs.filter((doc) => doc.role === 'owner');
  const shared = docs.filter((doc) => doc.role !== 'owner');

  const run = async (kind: 'new' | 'import', action: () => Promise<void>) => {
    setBusy(kind);
    setActionError(null);
    try {
      await action();
    } catch (runError) {
      setActionError(errorMessage(runError));
    } finally {
      setBusy(null);
    }
  };

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;
    void run('import', async () => {
      const { title, html } = await importFile(file);
      await onCreate({ title, content: generateJSON(html, createBaseExtensions()) });
    });
  };

  const renderList = (items: DocSummary[], emptyText: string, isShared: boolean) =>
    items.length === 0 ? (
      <p className="empty">{emptyText}</p>
    ) : (
      <ul className="doc-list">
        {items.map((doc) => (
          <li key={doc.id}>
            <button className={`doc-item${doc.id === selectedId ? ' active' : ''}`} onClick={() => onSelect(doc.id)}>
              <span className="doc-title">{doc.title}</span>
              <span className="doc-meta">
                {isShared ? (
                  <>
                    {doc.owner_name ?? doc.owner_email} · <span className={`badge ${doc.role}`}>{doc.role}</span>
                  </>
                ) : (
                  <>Edited {formatUpdated(doc.updated_at)}</>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">A</span> Ajaia Docs
      </div>
      <div className="user-row">
        <span title={email}>{email}</span>
        <button
          className="link"
          onClick={() => {
            window.location.hash = '#/';
            void supabase.auth.signOut();
          }}
        >
          Sign out
        </button>
      </div>

      <div className="actions">
        <button className="primary" disabled={busy !== null} onClick={() => void run('new', () => onCreate())}>
          {busy === 'new' ? 'Creating…' : '+ New document'}
        </button>
        <button disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          {busy === 'import' ? 'Importing…' : 'Import file'}
        </button>
        <input ref={fileInput} type="file" accept={ACCEPT_ATTRIBUTE} hidden onChange={onFileChosen} />
      </div>
      <p className="hint">Import turns a {SUPPORTED_LABEL} file (up to 2 MB) into a new document you own.</p>
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button className="link" onClick={onRefresh}>
            Retry
          </button>
        </p>
      )}

      <section>
        <h2 className="section-title">My documents</h2>
        {loading ? <p className="empty">Loading…</p> : renderList(owned, 'No documents yet.', false)}
      </section>
      <section>
        <h2 className="section-title">Shared with me</h2>
        {!loading && renderList(shared, 'Nothing has been shared with you yet.', true)}
      </section>
    </aside>
  );
}
