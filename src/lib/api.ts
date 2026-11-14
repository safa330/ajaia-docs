import type { JSONContent } from '@tiptap/react';
import { supabase } from './supabase';
import type { Doc, DocSummary, NewDocumentInput, Role, Share, ShareRole } from './types';

// The documents -> profiles relationship is named explicitly because
// document_shares also links the two tables.
const SUMMARY_COLUMNS = 'id, title, updated_at, owner_id, owner:profiles!documents_owner_id_fkey(email, display_name)';
export const MAX_CONTENT_CHARS = 900_000;

export class ConflictError extends Error {
  constructor() {
    super('Someone else saved a newer version of this document.');
    this.name = 'ConflictError';
  }
}

interface DocumentRow {
  id: string;
  title: string;
  updated_at: string;
  owner_id: string;
  owner: { email: string; display_name: string } | null;
}

function toSummary(row: DocumentRow, role: Role): DocSummary {
  return {
    id: row.id,
    title: row.title,
    updated_at: row.updated_at,
    owner_id: row.owner_id,
    owner_email: row.owner?.email ?? null,
    owner_name: row.owner?.display_name ?? null,
    role,
  };
}

async function myShareRoles(userId: string, documentIds?: string[]): Promise<Map<string, ShareRole>> {
  let query = supabase.from('document_shares').select('document_id, role').eq('user_id', userId);
  if (documentIds) query = query.in('document_id', documentIds);
  const { data, error } = await query;
  if (error) throw error;
  return new Map((data ?? []).map((share) => [share.document_id as string, share.role as ShareRole]));
}

/** Every document the user can open; RLS decides which rows come back. */
export async function listDocuments(userId: string): Promise<DocSummary[]> {
  const [{ data, error }, roles] = await Promise.all([
    supabase.from('documents').select(SUMMARY_COLUMNS).order('updated_at', { ascending: false }),
    myShareRoles(userId),
  ]);
  if (error) throw error;
  return (data as unknown as DocumentRow[]).map((row) =>
    toSummary(row, row.owner_id === userId ? 'owner' : (roles.get(row.id) ?? 'viewer')),
  );
}

export async function getDocument(id: string, userId: string): Promise<Doc> {
  const { data, error } = await supabase
    .from('documents')
    .select(`${SUMMARY_COLUMNS}, content, version`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This document does not exist or is no longer shared with you.');
  const row = data as unknown as DocumentRow & { content: JSONContent; version: number };
  const role: Role = row.owner_id === userId ? 'owner' : ((await myShareRoles(userId, [id])).get(id) ?? 'viewer');
  return { ...toSummary(row, role), content: row.content, version: row.version };
}

function assertContentSize(content?: JSONContent) {
  if (content && JSON.stringify(content).length > MAX_CONTENT_CHARS) {
    throw new Error('This document is too large to save (the limit is about 900 KB of content).');
  }
}

export async function createDocument(input: NewDocumentInput = {}): Promise<{ id: string }> {
  const title = (input.title ?? '').trim().slice(0, 200) || 'Untitled document';
  assertContentSize(input.content);
  const { data, error } = await supabase
    .from('documents')
    .insert(input.content ? { title, content: input.content } : { title })
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function getLatestVersion(id: string): Promise<number> {
  const { data, error } = await supabase.from('documents').select('version').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This document is no longer available to you.');
  return data.version as number;
}

/**
 * Save only if nobody else saved since `expectedVersion` (optimistic locking).
 * Throws ConflictError on a stale version, or a permission error if access was removed.
 */
export async function updateDocument(
  id: string,
  patch: { title?: string; content?: JSONContent },
  expectedVersion: number,
): Promise<{ version: number; updated_at: string }> {
  assertContentSize(patch.content);
  const changes: Record<string, unknown> = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.content !== undefined) changes.content = patch.content;

  const { data, error } = await supabase
    .from('documents')
    .update(changes)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select('version, updated_at');
  if (error) throw error;
  if (data && data.length === 1) return data[0] as { version: number; updated_at: string };

  // Nothing was updated: either a newer version exists, or we can no longer edit.
  const latest = await getLatestVersion(id).catch(() => null);
  if (latest !== null && latest !== expectedVersion) throw new ConflictError();
  throw new Error('You no longer have permission to edit this document.');
}

export async function deleteDocument(id: string): Promise<void> {
  const { data, error } = await supabase.from('documents').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Only the owner can delete this document.');
}

export async function listShares(documentId: string): Promise<Share[]> {
  const { data, error } = await supabase
    .from('document_shares')
    .select('user_id, role, created_at, user:profiles!document_shares_user_id_fkey(email, display_name)')
    .eq('document_id', documentId)
    .order('created_at');
  if (error) throw error;
  const rows = data as unknown as { user_id: string; role: ShareRole; user: { email: string; display_name: string } | null }[];
  return rows.map((row) => ({
    user_id: row.user_id,
    role: row.role,
    email: row.user?.email ?? 'unknown user',
    display_name: row.user?.display_name ?? '',
  }));
}

/** Grant or change access. The database function enforces "owner only" and validates the email and role. */
export async function shareDocument(documentId: string, email: string, role: ShareRole): Promise<void> {
  const { error } = await supabase.rpc('share_document', {
    doc_id: documentId,
    recipient_email: email,
    share_role: role,
  });
  if (error) throw error;
}

export async function revokeShare(documentId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('document_shares')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (!data?.length) throw new Error('That person no longer has access.');
}
