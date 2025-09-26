import { useEditor, EditorContent } from '@tiptap/react';
import { useMemo, useEffect } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
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

export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Start writing...',
  className,
  disabled = false,
  'data-testid': testId,
}: RichTextEditorProps) {
  // Memoize extensions to prevent duplicate registration warnings
  const extensions = useMemo(() => [
    StarterKit.configure({
      // Disable default list extensions to use custom ones
      bulletList: false,
      orderedList: false,
      listItem: false,
    }),
    TextStyle,
    Underline,
    BulletList.configure({
      HTMLAttributes: {
        class: 'prose-bullet-list',
      },
    }),
    OrderedList.configure({
      HTMLAttributes: {
        class: 'prose-ordered-list',
      },
    }),
    ListItem,
  ], []);

  const editor = useEditor({
    extensions,
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChange?.(html, text);
    },
  });

  // Clean up editor on unmount
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

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
      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-sm max-w-none p-3 min-h-[120px]",
          "focus-within:outline-none",
          "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:whitespace-pre-wrap",
          "[&_.prose-bullet-list]:list-disc [&_.prose-bullet-list]:ml-6",
          "[&_.prose-ordered-list]:list-decimal [&_.prose-ordered-list]:ml-6",
          "[&_.prose-bullet-list>li]:list-item",
          "[&_.prose-ordered-list>li]:list-item",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        data-testid={testId ? `${testId}-content` : undefined}
      />
      
      {(!content || content === '<p></p>') && (
        <div 
          className="absolute pointer-events-none text-muted-foreground px-3 py-3 top-[52px]"
          data-testid={testId ? `${testId}-placeholder` : undefined}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}