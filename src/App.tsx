import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configError, supabase } from './lib/supabase';
import { createDocument, listDocuments } from './lib/api';
import { errorMessage } from './lib/errors';
import type { DocSummary, NewDocumentInput } from './lib/types';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import DocumentEditor from './components/DocumentEditor';

/** The open document lives in the URL hash (#/d/<id>) so a refresh reopens it. */
function readDocIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/d\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (configError) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (configError) {
    return (
      <div className="center-card">
        <h1>Setup needed</h1>
        <p>{configError}</p>
      </div>
    );
  }
  if (!authReady) return <div className="center-card">Loading…</div>;
  if (!session) return <Login />;
  return <Workspace key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />;
}

function Workspace({ userId, email }: { userId: string; email: string }) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(readDocIdFromHash);

  const refresh = useCallback(async () => {
    try {
      setDocs(await listDocuments(userId));
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onHashChange = () => setSelectedId(readDocIdFromHash());
    const onFocus = () => void refresh(); // pick up documents shared while the tab was in the background
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const open = useCallback((id: string | null) => {
    const hash = id ? `#/d/${id}` : '#/';
    if (window.location.hash !== hash) window.location.hash = hash;
    setSelectedId(id);
  }, []);

  const create = useCallback(
    async (input?: NewDocumentInput) => {
      const { id } = await createDocument(input);
      await refresh();
      open(id);
    },
    [refresh, open],
  );

  const handleSaved = useCallback((id: string, change: { title?: string; updated_at: string }) => {
    setDocs((list) =>
      list
        .map((doc) => (doc.id === id ? { ...doc, title: change.title ?? doc.title, updated_at: change.updated_at } : doc))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    );
  }, []);

  const handleDeleted = useCallback(
    (id: string) => {
      setDocs((list) => list.filter((doc) => doc.id !== id));
      open(null);
    },
    [open],
  );

  return (
    <div className="layout">
      <Sidebar
        docs={docs}
        loading={loading}
        error={listError}
        selectedId={selectedId}
        email={email}
        onSelect={open}
        onCreate={create}
        onRefresh={refresh}
      />
      <main className="main">
        {selectedId ? (
          <DocumentEditor
            key={selectedId}
            docId={selectedId}
            userId={userId}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        ) : (
          <div className="empty-state">
            <h2>No document open</h2>
            <p>Create a new document, import a file, or pick one from the list.</p>
          </div>
        )}
      </main>
    </div>
  );
}
