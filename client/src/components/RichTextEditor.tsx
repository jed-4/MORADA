import { useEditor, EditorContent } from '@tiptap/react';
import { Fragment, useEffect, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Underline } from '@tiptap/extension-underline';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Type,
} from 'lucide-react';

export interface RichTextPlaceholder {
  token: string;
  label: string;
}

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
  placeholders?: RichTextPlaceholder[];
  /** Render the formatting buttons as a single vertical column on the left. */
  verticalToolbar?: boolean;
  toolbarSide?: 'left' | 'right';
}

const extensions = [
  StarterKit.configure({
    underline: false,
  }),
  TextStyle,
  Underline,
];

export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Start writing...',
  className,
  disabled = false,
  'data-testid': testId,
  placeholders,
  verticalToolbar = false,
  toolbarSide = 'left',
}: RichTextEditorProps) {
  const initialContentRef = useRef(content);
  const isInternalChange = useRef(false);

  const editor = useEditor(
    {
      extensions,
      content: initialContentRef.current,
      editable: !disabled,
      onUpdate: ({ editor }) => {
        isInternalChange.current = true;
        const html = editor.getHTML();
        const text = editor.getText();
        onChange?.(html, text);
      },
      editorProps: {
        attributes: {
          class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
        },
      },
    },
    []
  );

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      if (!isInternalChange.current) {
        editor.commands.setContent(content);
      }
      isInternalChange.current = false;
    }
  }, [editor, content]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    isActive,
    children,
    testId: buttonTestId,
  }: {
    onClick: () => void;
    isActive: boolean;
    children: React.ReactNode;
    testId?: string;
  }) => (
    <Button
      type="button"
      variant={isActive ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      className={cn('h-8 w-8 p-0', isActive && 'bg-primary text-primary-foreground')}
      data-testid={buttonTestId}
    >
      {children}
    </Button>
  );

  const insertToken = (token: string) => {
    if (!token) return;
    editor.chain().focus().insertContent(token).run();
  };

  const toolItems = [
    {
      key: 'bold',
      icon: Bold,
      onClick: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
      group: 0,
      testId: testId ? `${testId}-bold-button` : undefined,
    },
    {
      key: 'italic',
      icon: Italic,
      onClick: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
      group: 0,
      testId: testId ? `${testId}-italic-button` : undefined,
    },
    {
      key: 'underline',
      icon: UnderlineIcon,
      onClick: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
      group: 0,
      testId: testId ? `${testId}-underline-button` : undefined,
    },
    {
      key: 'bulletList',
      icon: List,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList'),
      group: 1,
      testId: testId ? `${testId}-bullet-list-button` : undefined,
    },
    {
      key: 'orderedList',
      icon: ListOrdered,
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList'),
      group: 1,
      testId: testId ? `${testId}-ordered-list-button` : undefined,
    },
    {
      key: 'clear',
      icon: Type,
      onClick: () => editor.chain().focus().clearNodes().unsetAllMarks().run(),
      isActive: false,
      group: 2,
      testId: testId ? `${testId}-clear-format-button` : undefined,
    },
  ];

  const toolButtons = toolItems.map((item, index) => {
    const Icon = item.icon;
    const prev = toolItems[index - 1];
    // In horizontal mode we keep the subtle dividers between button groups;
    // the vertical minimalist rail drops them for a clean single column.
    const showDivider = !verticalToolbar && !!prev && prev.group !== item.group;
    return (
      <Fragment key={item.key}>
        {showDivider && <div className="w-px h-6 bg-border mx-1" />}
        <ToolbarButton onClick={item.onClick} isActive={item.isActive} testId={item.testId}>
          <Icon className="h-4 w-4" />
        </ToolbarButton>
      </Fragment>
    );
  });

  return (
    <div className={cn('border rounded-md', verticalToolbar && 'flex', className)} data-testid={testId}>
      <div
        className={cn(
          verticalToolbar
            ? cn(
                'p-1.5 flex flex-col items-center gap-1 shrink-0',
                toolbarSide === 'right' ? 'border-l order-2' : 'border-r'
              )
            : 'border-b p-2 flex items-center gap-1 flex-wrap'
        )}
      >
        {toolButtons}

        {!verticalToolbar && placeholders && placeholders.length > 0 && (
          <>
            <div className="w-px h-6 bg-border mx-1" />
            <Select
              value=""
              onValueChange={(v) => insertToken(v)}
            >
              <SelectTrigger
                className="h-8 w-44 text-xs"
                data-testid={testId ? `${testId}-insert-placeholder` : 'select-insert-placeholder'}
              >
                <SelectValue placeholder="Insert placeholder" />
              </SelectTrigger>
              <SelectContent>
                {placeholders.map((p) => (
                  <SelectItem key={p.token} value={p.token} className="text-xs">
                    <span>{p.label}</span>
                    <span className="font-mono ml-2 text-muted-foreground">{p.token}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      <div className={cn('relative', verticalToolbar && 'flex-1 min-w-0')}>
        <EditorContent
          editor={editor}
          className={cn(
            'prose prose-sm dark:prose-invert max-w-none p-3 min-h-[120px]',
            'focus-within:outline-none',
            '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:whitespace-pre-wrap',
            '[&_ul]:list-disc [&_ul]:ml-6',
            '[&_ol]:list-decimal [&_ol]:ml-6',
            '[&_li]:list-item',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          data-testid={testId ? `${testId}-content` : undefined}
        />

        {(!content || content === '<p></p>') && (
          <div
            className="absolute pointer-events-none text-muted-foreground px-3 py-3 top-0 left-0"
            data-testid={testId ? `${testId}-placeholder` : undefined}
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
