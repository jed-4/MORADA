import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Minus,
  RemoveFormatting,
} from 'lucide-react';

interface NotionEditorProps {
  content?: string;
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

const BLOCK_TYPES = [
  { id: 'h1', label: 'Heading 1', icon: Heading1, action: (e: any) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', icon: Heading2, action: (e: any) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', icon: Heading3, action: (e: any) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'p', label: 'Text', icon: AlignLeft, action: (e: any) => e.chain().focus().setParagraph().run() },
  { id: 'ul', label: 'Bullet list', icon: List, action: (e: any) => e.chain().focus().toggleBulletList().run() },
  { id: 'ol', label: 'Numbered list', icon: ListOrdered, action: (e: any) => e.chain().focus().toggleOrderedList().run() },
  { id: 'todo', label: 'To-do', icon: CheckSquare, action: (e: any) => e.chain().focus().toggleTaskList().run() },
  { id: 'code', label: 'Code block', icon: Code, action: (e: any) => e.chain().focus().toggleCodeBlock().run() },
  { id: 'quote', label: 'Quote', icon: Quote, action: (e: any) => e.chain().focus().toggleBlockquote().run() },
  { id: 'hr', label: 'Divider', icon: Minus, action: (e: any) => e.chain().focus().setHorizontalRule().run() },
];

export default function NotionEditor({
  content = '',
  onChange,
  placeholder = 'Write something, or type \'/\' for commands…',
  className,
  editable = true,
}: NotionEditorProps) {
  const isInternalChange = useRef(false);
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; query: string; x: number; y: number }>({
    open: false, query: '', x: 0, y: 0,
  });
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const slashMenuOpen = useRef(false);

  const [bubbleMenu, setBubbleMenu] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false, x: 0, y: 0,
  });
  const [floatingMenu, setFloatingMenu] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false, x: 0, y: 0,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      Underline,
      TextStyle,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
    onUpdate: ({ editor: e }) => {
      isInternalChange.current = true;
      onChange?.(e.getHTML(), e.getText());

      const { selection, doc } = e.state;
      const { $head } = selection;
      const lineText = $head.parent.textContent;

      if (lineText.startsWith('/')) {
        const query = lineText.slice(1).toLowerCase();
        const { view } = e;
        const coords = view.coordsAtPos(selection.from);
        setSlashMenu({ open: true, query, x: coords.left, y: coords.bottom + 4 });
        slashMenuOpen.current = true;
      } else if (slashMenuOpen.current) {
        setSlashMenu(prev => ({ ...prev, open: false }));
        slashMenuOpen.current = false;
      }
    },
    onSelectionUpdate: ({ editor: e }) => {
      const { selection } = e.state;
      const { empty, from, to } = selection;

      if (!empty && editable) {
        try {
          const { view } = e;
          const start = view.coordsAtPos(from);
          const end = view.coordsAtPos(to);
          const x = (start.left + end.left) / 2;
          const y = start.top - 8;
          setBubbleMenu({ visible: true, x, y });
        } catch {
          setBubbleMenu(prev => ({ ...prev, visible: false }));
        }
      } else {
        setBubbleMenu(prev => ({ ...prev, visible: false }));
      }

      if (editable) {
        const { $head } = selection;
        const isEmpty = $head.parent.textContent === '' && $head.parent.type.name === 'paragraph';
        if (isEmpty && empty) {
          try {
            const { view } = e;
            const coords = view.coordsAtPos(from);
            setFloatingMenu({ visible: true, x: coords.left, y: coords.top });
          } catch {
            setFloatingMenu(prev => ({ ...prev, visible: false }));
          }
        } else {
          setFloatingMenu(prev => ({ ...prev, visible: false }));
        }
      }
    },
    onBlur: () => {
      setTimeout(() => {
        setBubbleMenu(prev => ({ ...prev, visible: false }));
        setFloatingMenu(prev => ({ ...prev, visible: false }));
      }, 150);
    },
  }, []);

  useEffect(() => {
    if (!editor) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [editor, content]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setSlashMenu(prev => ({ ...prev, open: false }));
        slashMenuOpen.current = false;
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applySlashCommand = useCallback((blockType: typeof BLOCK_TYPES[0]) => {
    if (!editor) return;
    const { $head } = editor.state.selection;
    const lineStart = $head.start();
    const lineEnd = $head.end();
    editor.chain().focus().deleteRange({ from: lineStart, to: lineEnd }).run();
    blockType.action(editor);
    setSlashMenu(prev => ({ ...prev, open: false }));
    slashMenuOpen.current = false;
  }, [editor]);

  const filteredBlocks = slashMenu.query
    ? BLOCK_TYPES.filter(b => b.label.toLowerCase().includes(slashMenu.query))
    : BLOCK_TYPES;

  if (!editor) return null;

  return (
    <div className={cn('relative', className)}>
      {/* Bubble Menu — text selection toolbar */}
      {bubbleMenu.visible && (
        <div
          className="fixed z-50 flex items-center gap-0.5 rounded-md border bg-popover shadow-md p-1"
          style={{ left: bubbleMenu.x, top: bubbleMenu.y, transform: 'translate(-50%, -100%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <BubbleBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold className="h-3.5 w-3.5" />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic className="h-3.5 w-3.5" />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon className="h-3.5 w-3.5" />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
            <Strikethrough className="h-3.5 w-3.5" />
          </BubbleBtn>
          <div className="w-px h-4 bg-border mx-0.5" />
          <BubbleBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
            <Heading1 className="h-3.5 w-3.5" />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 className="h-3.5 w-3.5" />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
            <Heading3 className="h-3.5 w-3.5" />
          </BubbleBtn>
          <div className="w-px h-4 bg-border mx-0.5" />
          <BubbleBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} active={false} title="Clear formatting">
            <RemoveFormatting className="h-3.5 w-3.5" />
          </BubbleBtn>
        </div>
      )}

      {/* Floating Menu — shown on empty paragraphs */}
      {floatingMenu.visible && (
        <div
          className="fixed z-50 flex items-center gap-0.5 rounded-md border bg-popover shadow-md p-1"
          style={{ left: floatingMenu.x - 8, top: floatingMenu.y, transform: 'translate(-100%, -50%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {BLOCK_TYPES.slice(0, 7).map(bt => (
            <button
              key={bt.id}
              type="button"
              title={bt.label}
              onClick={() => bt.action(editor)}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover-elevate active-elevate-2"
            >
              <bt.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}

      {/* Slash command menu */}
      {slashMenu.open && filteredBlocks.length > 0 && (
        <div
          ref={slashMenuRef}
          className="fixed z-50 w-52 rounded-md border bg-popover shadow-lg py-1 text-sm"
          style={{ left: slashMenu.x, top: slashMenu.y }}
        >
          {filteredBlocks.map(bt => (
            <button
              key={bt.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applySlashCommand(bt);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover-elevate active-elevate-2"
            >
              <bt.icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{bt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Editor content */}
      <div className="relative">
        <EditorContent
          editor={editor}
          className={cn(
            '[&_.ProseMirror]:outline-none',
            '[&_.ProseMirror]:min-h-[200px]',
            '[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mt-6 [&_.ProseMirror_h1]:mb-2',
            '[&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mt-5 [&_.ProseMirror_h2]:mb-1.5',
            '[&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-1',
            '[&_.ProseMirror_p]:my-1 [&_.ProseMirror_p]:leading-relaxed',
            '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-5 [&_.ProseMirror_ul]:my-1',
            '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-5 [&_.ProseMirror_ol]:my-1',
            '[&_.ProseMirror_li]:my-0.5',
            '[&_.ProseMirror_ul[data-type="taskList"]]:list-none [&_.ProseMirror_ul[data-type="taskList"]]:ml-0',
            '[&_.ProseMirror_li[data-type="taskItem"]]:flex [&_.ProseMirror_li[data-type="taskItem"]]:items-start [&_.ProseMirror_li[data-type="taskItem"]]:gap-2',
            '[&_.ProseMirror_li[data-type="taskItem"]>label]:mt-0.5',
            '[&_.ProseMirror_li[data-type="taskItem"]>label>input[type="checkbox"]]:cursor-pointer',
            '[&_.ProseMirror_li[data-type="taskItem"]>div]:flex-1',
            '[&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:text-sm [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:overflow-x-auto',
            '[&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono',
            '[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0',
            '[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_blockquote]:italic',
            '[&_.ProseMirror_hr]:border-border [&_.ProseMirror_hr]:my-4',
            '[&_.ProseMirror_li[data-type="taskItem"][data-checked="true"]>div]:line-through [&_.ProseMirror_li[data-type="taskItem"][data-checked="true"]>div]:text-muted-foreground',
          )}
        />
        {(!content || content === '<p></p>') && (
          <p className="absolute top-0 left-0 text-muted-foreground pointer-events-none select-none leading-relaxed">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}

function BubbleBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        'h-6 w-6 flex items-center justify-center rounded',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover-elevate active-elevate-2'
      )}
    >
      {children}
    </button>
  );
}
