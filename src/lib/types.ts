import type { JSONContent } from '@tiptap/react';

export type Role = 'owner' | 'editor' | 'viewer';
export type ShareRole = Exclude<Role, 'owner'>;

export interface DocSummary {
  id: string;
  title: string;
  updated_at: string;
  owner_id: string;
  owner_email: string | null;
  owner_name: string | null;
  /** The signed-in user's access to this document. */
  role: Role;
}

export interface Doc extends DocSummary {
  content: JSONContent;
  version: number;
}

export interface Share {
  user_id: string;
  email: string;
  display_name: string;
  role: ShareRole;
}

export interface NewDocumentInput {
  title?: string;
  content?: JSONContent;
}
