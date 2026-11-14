import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';

/**
 * One schema for the editor and for file import, so imported files can only
 * contain what the editor supports (paragraphs, headings 1-3, lists, quotes, code, marks).
 */
export function createBaseExtensions() {
  return [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Underline];
}
