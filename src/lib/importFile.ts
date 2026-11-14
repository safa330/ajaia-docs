import { marked } from 'marked';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'];
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.join(',');
export const SUPPORTED_LABEL = '.txt, .md or .docx';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export interface ImportedFile {
  title: string;
  html: string;
}

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'Imported document').slice(0, 200);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Blank lines separate paragraphs; single line breaks are kept inside a paragraph. */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '<p></p>';
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
}

/**
 * Markdown is converted to HTML; the editor schema then keeps only the nodes it
 * knows (headings, lists, marks...), so scripts or unknown tags never reach a document.
 */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true }) as string;
}

/** Validate a file and convert it to HTML that the editor can load as a new document. */
export async function importFile(file: File): Promise<ImportedFile> {
  const extension = getExtension(file.name);
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error(`Unsupported file type "${extension || file.name}". Please upload a ${SUPPORTED_LABEL} file.`);
  }
  if (file.size === 0) throw new Error('That file is empty.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is larger than 2 MB.');

  const title = titleFromFileName(file.name);

  if (extension === '.docx') {
    // Loaded on demand: mammoth is large and only needed for Word files.
    const module: any = await import('mammoth/mammoth.browser.js');
    const mammoth = module.default ?? module;
    let html: string;
    try {
      ({ value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }));
    } catch {
      throw new Error('Could not read that .docx file. Is it a valid Word document?');
    }
    if (!html.replace(/<[^>]*>/g, '').trim()) throw new Error('No readable text was found in that .docx file.');
    return { title, html };
  }

  const text = await file.text();
  return { title, html: extension === '.txt' ? textToHtml(text) : markdownToHtml(text) };
}
