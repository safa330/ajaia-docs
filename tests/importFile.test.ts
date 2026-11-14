import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, importFile, markdownToHtml, textToHtml, titleFromFileName } from '../src/lib/importFile';

describe('file import', () => {
  it('turns plain text into paragraphs and escapes markup', () => {
    expect(textToHtml('Hello <b>world</b>\nline two\r\n\r\nSecond paragraph')).toBe(
      '<p>Hello &lt;b&gt;world&lt;/b&gt;<br>line two</p><p>Second paragraph</p>',
    );
  });

  it('keeps Markdown headings, emphasis and lists', () => {
    const html = markdownToHtml('# Plan\n\n**Bold** and *italic*\n\n- one\n- two\n\n1. first\n2. second');
    expect(html).toContain('<h1>Plan</h1>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
  });

  it('builds a readable title from the file name', () => {
    expect(titleFromFileName('q3_launch-notes.md')).toBe('q3 launch notes');
    expect(titleFromFileName('.md')).toBe('Imported document');
  });

  it('imports .md and .txt files', async () => {
    const md = await importFile(new File(['# Hello'], 'hello.md', { type: 'text/markdown' }));
    expect(md).toEqual({ title: 'hello', html: expect.stringContaining('<h1>Hello</h1>') });
    const txt = await importFile(new File(['first\n\nsecond'], 'Notes.TXT'));
    expect(txt).toEqual({ title: 'Notes', html: '<p>first</p><p>second</p>' });
  });

  it('rejects unsupported, empty and oversized files with a clear message', async () => {
    await expect(importFile(new File(['x'], 'report.pdf'))).rejects.toThrow(/Unsupported file type ".pdf"/);
    await expect(importFile(new File([], 'empty.txt'))).rejects.toThrow(/empty/);
    await expect(importFile(new File(['a'.repeat(MAX_IMPORT_BYTES + 1)], 'big.txt'))).rejects.toThrow(/2 MB/);
  });
});
