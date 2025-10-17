import { useState, useEffect } from 'react';
import { pdf, PDFDownloadLink } from '@react-pdf/renderer';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GripVertical, Plus, Download, Eye, Loader2 } from 'lucide-react';
import type { Proposal, ProposalSection } from '@shared/schema';
import { ProposalDocument } from './pdf/ProposalDocument';

interface SortableSectionItemProps {
  section: ProposalSection;
  onEdit: (section: ProposalSection) => void;
}

function SortableSectionItem({ section, onEdit }: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-background border rounded-md mb-2"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1" onClick={() => onEdit(section)}>
        <p className="font-medium text-sm">{section.name}</p>
        <p className="text-xs text-muted-foreground">{section.sectionType}</p>
      </div>
    </div>
  );
}

interface ProposalBuilderProps {
  proposal: Proposal;
  sections: ProposalSection[];
  onSectionsReorder: (sections: ProposalSection[]) => void;
  onSectionEdit: (section: ProposalSection) => void;
  onAddSection: () => void;
  companyLogo?: string;
  companyName?: string;
}

export function ProposalBuilder({
  proposal,
  sections,
  onSectionsReorder,
  onSectionEdit,
  onAddSection,
  companyLogo,
  companyName,
}: ProposalBuilderProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    let isCancelled = false;
    
    async function generatePdf() {
      if (!showPreview) return;
      
      setIsGenerating(true);
      
      try {
        const blob = await pdf(
          <ProposalDocument
            proposal={proposal}
            sections={sections}
            companyLogo={companyLogo}
            companyName={companyName}
          />
        ).toBlob();
        
        if (!isCancelled) {
          const url = URL.createObjectURL(blob);
          setPdfUrl(prevUrl => {
            if (prevUrl) URL.revokeObjectURL(prevUrl);
            return url;
          });
        }
      } catch (error) {
        console.error('Error generating PDF:', error);
      } finally {
        if (!isCancelled) {
          setIsGenerating(false);
        }
      }
    }
    
    generatePdf();
    
    return () => {
      isCancelled = true;
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [proposal, sections, companyLogo, companyName, showPreview]);

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      const reorderedSections = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({
        ...s,
        order: idx,
      }));
      onSectionsReorder(reorderedSections);
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* PDF Preview Panel - 60% */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Preview</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              data-testid="button-toggle-preview"
            >
              <Eye className="w-4 h-4 mr-2" />
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>
            <PDFDownloadLink
              document={
                <ProposalDocument
                  proposal={proposal}
                  sections={sections}
                  companyLogo={companyLogo}
                  companyName={companyName}
                />
              }
              fileName={`${proposal.proposalNumber}.pdf`}
            >
              {({ loading }) => (
                <Button
                  variant="default"
                  size="sm"
                  disabled={loading}
                  data-testid="button-download-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {loading ? 'Generating...' : 'Download PDF'}
                </Button>
              )}
            </PDFDownloadLink>
          </div>
        </div>

        {showPreview ? (
          <div className="flex-1 border rounded-lg overflow-hidden bg-gray-100 relative">
            {isGenerating ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Generating PDF...</span>
                </div>
              </div>
            ) : null}
            {pdfUrl ? (
              <embed
                src={pdfUrl}
                type="application/pdf"
                width="100%"
                height="100%"
                className="w-full h-full"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Loading preview...</p>
              </div>
            )}
          </div>
        ) : (
          <Card className="flex-1 flex items-center justify-center text-muted-foreground">
            Preview hidden - Click "Show Preview" to view
          </Card>
        )}
      </div>

      {/* Section Sidebar - 40% */}
      <div className="w-96 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sections</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddSection}
            data-testid="button-add-section"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Section
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section) => (
                <SortableSectionItem
                  key={section.id}
                  section={section}
                  onEdit={onSectionEdit}
                />
              ))}
            </SortableContext>
          </DndContext>

          {sections.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              <p className="mb-2">No sections yet</p>
              <p className="text-sm">Click "Add Section" to get started</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
