import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { Underline } from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Type } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STAMP_FONT_CSS, STAMP_FONT_LABELS, type StampFontKey } from './pdf/importedTextBoxes';

/**
 * The rich text inside one merge-field box.
 *
 * Its own editor rather than the shared RichTextEditor, on purpose. This one
 * needs font-family and point-size controls that apply to the SELECTION, and
 * the shared editor has neither — adding them there would put them on every
 * cover letter, scope and terms editor in the builder, which is not what was
 * asked for. Bold, italic and underline behave identically in both.
 *
 * Sizes are written in POINTS because that is what a PDF measures in. Storing
 * px would mean a conversion on the way in and another on the way out, and
 * every round trip through the editor would re-round the number.
 */

const SIZES = [7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

interface Props {
  html: string;
  onChange: (html: string) => void;
  /** The box's own font and size — what "no run override" resolves to. */
  boxFont: StampFontKey;
  boxSize: number;
  /** Inserted at the cursor by the field picker above. */
  registerInsert?: (insert: (token: string) => void) => void;
}

export function MergeFieldEditor({ html, onChange, boxFont, boxSize, registerInsert }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      TextStyle,
      FontFamily,
      FontSize,
      Underline,
    ],
    content: html || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: 'min-h-[70px] max-h-40 overflow-auto px-2 py-1.5 text-xs focus:outline-none',
        'data-testid': 'input-merge-field-html',
      },
    },
  });

  /* The field picker lives above this component; it needs a way in. A ref
     callback rather than an imperative handle keeps the parent from having to
     hold an editor instance it has no other use for. */
  useEffect(() => {
    if (!editor || !registerInsert) return;
    registerInsert((token: string) => editor.chain().focus().insertContent(token).run());
  }, [editor, registerInsert]);

  /* Selecting a different box must show that box's content. Guarded on the
     rendered HTML so typing does not fight the sync: TipTap emits onUpdate,
     the parent stores it, and it comes straight back as this prop. */
  useEffect(() => {
    if (!editor) return;
    const incoming = html || '';
    if (editor.getHTML() !== incoming) editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, html]);

  if (!editor) return null;

  const runFont = (editor.getAttributes('textStyle').fontFamily as string | undefined) ?? '';
  const runSize = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '';

  const mark = (active: boolean) =>
    `h-6 w-6 flex items-center justify-center rounded border text-xs hover-elevate active-elevate-2 ${
      active ? 'border-primary bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground'
    }`;

  return (
    <div className="rounded-md border border-input bg-background" data-testid="merge-field-editor">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 p-1">
        <button type="button" className={mark(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()} data-testid="button-merge-bold">
          <Bold className="w-3 h-3" />
        </button>
        <button type="button" className={mark(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()} data-testid="button-merge-italic">
          <Italic className="w-3 h-3" />
        </button>
        <button type="button" className={mark(editor.isActive('underline'))}
          onClick={() => editor.chain().focus().toggleUnderline().run()} data-testid="button-merge-underline">
          <UnderlineIcon className="w-3 h-3" />
        </button>

        <div className="w-px h-4 bg-border/60 mx-0.5" aria-hidden="true" />

        {/* Empty value means "whatever the box is set to", so a builder who
            never touches these gets one consistent style for free. */}
        <Select
          value={runFont}
          onValueChange={(v) => {
            if (v === '__box') editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
        >
          <SelectTrigger className="h-6 w-[92px] text-xs px-1.5" data-testid="select-merge-font">
            <SelectValue placeholder={STAMP_FONT_LABELS[boxFont]} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__box" className="text-xs">{STAMP_FONT_LABELS[boxFont]} (box)</SelectItem>
            {(Object.keys(STAMP_FONT_LABELS) as StampFontKey[]).map((key) => (
              <SelectItem key={key} value={STAMP_FONT_CSS[key]} className="text-xs">
                {STAMP_FONT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={runSize}
          onValueChange={(v) => {
            if (v === '__box') editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(v).run();
          }}
        >
          <SelectTrigger className="h-6 w-[70px] text-xs px-1.5" data-testid="select-merge-size">
            <SelectValue placeholder={`${boxSize}pt`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__box" className="text-xs">{boxSize}pt (box)</SelectItem>
            {SIZES.map((n) => (
              <SelectItem key={n} value={`${n}pt`} className="text-xs">{n}pt</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          className={mark(false)}
          title="Clear formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
          data-testid="button-merge-clear"
        >
          <Type className="w-3 h-3" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
