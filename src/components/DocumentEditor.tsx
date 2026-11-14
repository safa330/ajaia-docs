import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { createBaseExtensions } from '../lib/editorExtensions';
import { ConflictError, deleteDocument, getDocument, getLatestVersion, updateDocument } from '../lib/api';
import { errorMessage } from '../lib/errors';
import type { Doc, Role } from '../lib/types';
import Toolbar from './Toolbar';
import ShareDialog from './ShareDialog';

type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' | 'conflict';
type Patch = { title?: string; content?: JSONContent };

const SAVE_DELAY_MS = 800;
const MAX_TITLE_LENGTH = 200;

const STATUS_TEXT: Record<SaveState, string> = {
  idle: '',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Not saved',
  conflict: 'Not saved',
};

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' };

interface Props {
  docId: string;
  userId: string;
  onSaved: (id: string, change: { title?: string; updated_at: string }) => void;
  onDeleted: (id: string) => void;
}

/** One instance per open document (the parent passes key={docId}). */
export default function DocumentEditor({ docId, userId, onSaved, onDeleted }: Props) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Autosave state lives in refs so editor callbacks always see the latest values.
  const pending = useRef<Patch | null>(null);
  const inFlight = useRef(false);
  const version = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const canEdit = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  /** Send pending changes. Only one request at a time; later edits wait for the next round. */
  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    if (inFlight.current || !job) return;
    pending.current = null;
    inFlight.current = true;
    setSaveState('saving');
    try {
      const saved = await updateDocument(docId, job, version.current);
      version.current = saved.version;
      onSavedRef.current(docId, { title: job.title, updated_at: saved.updated_at });
      inFlight.current = false;
      if (pending.current) {
        void flush();
      } else {
        setSaveState('saved');
        setSaveError(null);
      }
    } catch (error) {
      inFlight.current = false;
      // Keep the unsaved changes (newer edits win) so the user can retry or resolve the conflict.
      const newer = pending.current as Patch | null;
      pending.current = { title: newer?.title ?? job.title, content: newer?.content ?? job.content };
      if (error instanceof ConflictError) {
        setSaveState('conflict');
      } else {
        setSaveState('error');
        setSaveError(errorMessage(error));
      }
    }
  }, [docId]);

  const schedule = useCallback(
    (change: Patch) => {
      pending.current = { ...pending.current, ...change };
      setSaveState('unsaved');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  const editor = useEditor({
    extensions: [...createBaseExtensions(), Placeholder.configure({ placeholder: 'Start writing…' })],
    editable: false,
    onUpdate: ({ editor: current }) => {
      if (canEdit.current) scheduleRef.current({ content: current.getJSON() });
    },
  });

  /** Load the latest saved version from the server into the editor. */
  const openLatest = useCallback(async () => {
    if (!editor) return;
    setLoadError(null);
    try {
      const loaded = await getDocument(docId, userId);
      pending.current = null;
      window.clearTimeout(timer.current);
      version.current = loaded.version;
      canEdit.current = loaded.role !== 'viewer';
      editor.commands.setContent(loaded.content, false);
      editor.setEditable(canEdit.current, false);
      setDoc(loaded);
      setTitle(loaded.title);
      setTitleError(null);
      setSaveState('idle');
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [editor, docId, userId]);

  useEffect(() => {
    void openLatest();
  }, [openLatest]);

  // Warn before closing the tab with unsaved work; save when switching documents; Ctrl/Cmd+S saves now.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown);
      void flush();
    };
  }, [flush]);

  const commitTitle = () => {
    if (!doc || !canEdit.current) return;
    const next = title.trim();
    if (!next) {
      setTitle(doc.title);
      setTitleError('A document needs a title, so the previous title was kept.');
      return;
    }
    if (next.length > MAX_TITLE_LENGTH) {
      setTitleError(`Titles can be at most ${MAX_TITLE_LENGTH} characters.`);
      return;
    }
    setTitleError(null);
    setTitle(next);
    if (next === doc.title) return;
    setDoc({ ...doc, title: next });
    schedule({ title: next });
    void flush();
  };

  const onTitleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape' && doc) {
      setTitle(doc.title);
      event.currentTarget.blur();
    }
  };

  const keepMine = async () => {
    try {
      version.current = await getLatestVersion(docId);
      await flush();
    } catch (error) {
      setSaveState('error');
      setSaveError(errorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (!doc || !window.confirm(`Delete "${doc.title}" for everyone? This cannot be undone.`)) return;
    pending.current = null;
    window.clearTimeout(timer.current);
    try {
      await deleteDocument(docId);
      onDeleted(docId);
    } catch (error) {
      setSaveState('error');
      setSaveError(errorMessage(error));
    }
  };

  if (loadError) {
    return (
      <div className="empty-state">
        <h2>Can't open this document</h2>
        <p>{loadError}</p>
        <button onClick={() => void openLatest()}>Try again</button>
      </div>
    );
  }
  if (!doc || !editor) return <div className="empty-state">Loading document…</div>;

  const isOwner = doc.role === 'owner';
  const isViewer = doc.role === 'viewer';

  return (
    <div className="editor-shell">
      <header className="doc-header">
        <input
          className="title-input"
          aria-label="Document title"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          disabled={isViewer}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={onTitleKeyDown}
        />
        <div className="doc-meta-row">
          <span className={`badge ${doc.role}`}>{ROLE_LABEL[doc.role]}</span>
          {!isOwner && <span>Shared by {doc.owner_name ?? doc.owner_email}</span>}
          <span className={`save-status ${saveState}`} aria-live="polite">
            {STATUS_TEXT[saveState]}
          </span>
        </div>
        <div className="header-actions">
          <button className={isOwner ? 'primary' : ''} onClick={() => setShareOpen(true)}>
            {isOwner ? 'Share' : 'Access'}
          </button>
          {isOwner && (
            <button className="danger" onClick={() => void handleDelete()}>
              Delete
            </button>
          )}
        </div>
      </header>

      {!isViewer && <Toolbar editor={editor} />}

      {isViewer && (
        <div className="banner info">You have view-only access. Ask {doc.owner_email} if you need to edit.</div>
      )}
      {titleError && <div className="banner warning">{titleError}</div>}
      {saveState === 'conflict' && (
        <div className="banner warning" role="alert">
          <span>Someone else saved a newer version while you were editing.</span>
          <button onClick={() => void openLatest()}>Load their version</button>
          <button onClick={() => void keepMine()}>Overwrite with mine</button>
        </div>
      )}
      {saveState === 'error' && (
        <div className="banner danger" role="alert">
          <span>Couldn't save: {saveError}</span>
          <button onClick={() => void flush()}>Retry</button>
        </div>
      )}

      <div className="page-wrap">
        <div
          className="page"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isViewer) {
              event.preventDefault();
              editor.commands.focus('end');
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {shareOpen && <ShareDialog doc={doc} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
