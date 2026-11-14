import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';

type Block = 'p' | 'h1' | 'h2' | 'h3';

function currentBlock(editor: Editor): Block {
  for (const level of [1, 2, 3] as const) {
    if (editor.isActive('heading', { level })) return `h${level}`;
  }
  return 'p';
}

export default function Toolbar({ editor }: { editor: Editor }) {
  const setBlock = (block: Block) => {
    const chain = editor.chain().focus();
    if (block === 'p') chain.setParagraph().run();
    else chain.setHeading({ level: Number(block[1]) as 1 | 2 | 3 }).run();
  };

  const button = (label: ReactNode, name: string, active: boolean, run: () => void, disabled = false) => (
    <button
      type="button"
      className={active ? 'is-active' : undefined}
      aria-label={name}
      aria-pressed={active}
      title={name}
      disabled={disabled}
      // Keep the text selection when clicking a toolbar button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {button('↶', 'Undo (Ctrl+Z)', false, () => editor.chain().focus().undo().run(), !editor.can().undo())}
      {button('↷', 'Redo (Ctrl+Shift+Z)', false, () => editor.chain().focus().redo().run(), !editor.can().redo())}
      <span className="sep" />
      <select aria-label="Text style" value={currentBlock(editor)} onChange={(event) => setBlock(event.target.value as Block)}>
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="sep" />
      {button(<b>B</b>, 'Bold (Ctrl+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
      {button(<i>I</i>, 'Italic (Ctrl+I)', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
      {button(<u>U</u>, 'Underline (Ctrl+U)', editor.isActive('underline'), () =>
        editor.chain().focus().toggleUnderline().run(),
      )}
      <span className="sep" />
      {button('• List', 'Bulleted list', editor.isActive('bulletList'), () =>
        editor.chain().focus().toggleBulletList().run(),
      )}
      {button('1. List', 'Numbered list', editor.isActive('orderedList'), () =>
        editor.chain().focus().toggleOrderedList().run(),
      )}
      {button('❝', 'Quote', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run())}
    </div>
  );
}
