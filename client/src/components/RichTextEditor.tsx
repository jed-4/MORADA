import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Type,
} from 'lucide-react';

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

// Static extensions configuration to prevent recreation
// Note: StarterKit already includes Underline extension in v3+
const extensions = [
  StarterKit,
  TextStyle,
];

export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Start writing...',
  className,
  disabled = false,
  'data-testid': testId,
}: RichTextEditorProps) {
  const initialContentRef = useRef(content);

  const editor = useEditor(
    {
      extensions,
      content: initialContentRef.current,
      editable: !disabled,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        const text = editor.getText();
        onChange?.(html, text);
      },
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none focus:outline-none',
        },
      },
    },
    []
  );

  // Sync content when it changes from outside
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  // Update editable state when disabled prop changes
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
    testId: buttonTestId 
  }: { 
    onClick: () => void; 
    isActive: boolean; 
    children: React.ReactNode;
    testId?: string;
  }) => (
    <Button
      type="button"
      variant={isActive ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      className={cn(
        "h-8 w-8 p-0",
        isActive && "bg-primary text-primary-foreground"
      )}
      data-testid={buttonTestId}
    >
      {children}
    </Button>
  );

  return (
    <div className={cn("border rounded-md", className)} data-testid={testId}>
      {/* Toolbar */}
      <div className="border-b p-2 flex items-center gap-1 flex-wrap">
        <div className="flex items-center gap-1">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            testId={testId ? `${testId}-bold-button` : undefined}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            testId={testId ? `${testId}-italic-button` : undefined}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            testId={testId ? `${testId}-underline-button` : undefined}
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
        </div>
        
        <div className="w-px h-6 bg-border mx-1" />
        
        <div className="flex items-center gap-1">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            testId={testId ? `${testId}-bullet-list-button` : undefined}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            testId={testId ? `${testId}-ordered-list-button` : undefined}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="w-px h-6 bg-border mx-1" />
        
        <div className="flex items-center gap-1">
          <ToolbarButton
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            isActive={false}
            testId={testId ? `${testId}-clear-format-button` : undefined}
          >
            <Type className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor Content */}
      <div className="relative">
        <EditorContent
          editor={editor}
          className={cn(
            "prose prose-sm max-w-none p-3 min-h-[120px]",
            "focus-within:outline-none",
            "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:whitespace-pre-wrap",
            "[&_ul]:list-disc [&_ul]:ml-6",
            "[&_ol]:list-decimal [&_ol]:ml-6",
            "[&_li]:list-item",
            disabled && "opacity-50 cursor-not-allowed"
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