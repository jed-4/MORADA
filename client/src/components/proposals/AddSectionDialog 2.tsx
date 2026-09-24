import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { ProposalSection } from '@shared/schema';

/**
 * Choosing what kind of section to add.
 *
 * Shared between the proposal page and the template page on purpose. The
 * template page used to add a "custom" section and nothing else, so a template
 * could not contain a cover page, an estimate table or — the one that
 * mattered — an imported PDF intro page. A template that cannot hold the
 * sections a proposal holds is not a template of a proposal.
 *
 * The seeded content lives here too, so a Closing added to a template opens
 * with the same wording it would on a real proposal.
 */

export const SECTION_TYPES = [
  { value: 'cover_page', label: 'Cover Page' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'scope', label: 'Scope of Work' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'summary', label: 'Summary' },
  { value: 'allowances', label: 'Allowances' },
  { value: 'inclusions_exclusions', label: 'Inclusions & Exclusions' },
  { value: 'payment_schedule', label: 'Payment Schedule' },
  { value: 'closing', label: 'Closing' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'terms_conditions', label: 'Terms & Conditions' },
  { value: 'signature', label: 'Signature' },
  { value: 'imported_pdf', label: 'Imported PDF page' },
  { value: 'custom', label: 'Custom Section' },
];

export interface AddSectionCompanyDefaults {
  companyName?: string;
  termsAndConditions?: string | null;
  termsTemplates?: Array<{ id: string; name: string; content: string; defaultFor?: string[] }>;
}

/** The content a freshly added section opens with, by type. */
export function seedSectionContent(
  sectionType: string,
  company: AddSectionCompanyDefaults | null | undefined,
): Record<string, unknown> | undefined {
  if (sectionType === 'closing') {
    const companyName = company?.companyName || '[Company Name]';
    return {
      closingText: `<p>Thank you for considering ${companyName}. We look forward to working with you.</p>`,
    };
  }
  if (sectionType === 'terms_conditions') {
    const tpls = company?.termsTemplates ?? [];
    const tpl = tpls.find((t) => Array.isArray(t.defaultFor) && t.defaultFor.includes('proposal'));
    const text = tpl?.content || company?.termsAndConditions || '';
    return text ? { termsText: text } : undefined;
  }
  return undefined;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: AddSectionCompanyDefaults | null;
  /** Called with everything the new section needs. */
  onAdd: (section: Partial<ProposalSection>) => void;
  isAdding?: boolean;
  /** "proposal" or "template" — only the wording differs. */
  noun?: string;
}

export function AddSectionDialog({ open, onOpenChange, company, onAdd, isAdding, noun = 'proposal' }: Props) {
  const { toast } = useToast();
  const [sectionType, setSectionType] = useState('custom');
  const [name, setName] = useState('');

  const create = () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Please enter a section name.', variant: 'destructive' });
      return;
    }
    const content = seedSectionContent(sectionType, company);
    onAdd({
      name: name.trim(),
      sectionType,
      description: '',
      ...(content ? { content: content as ProposalSection['content'] } : {}),
    });
    setName('');
    setSectionType('custom');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Section</DialogTitle>
          <DialogDescription>
            Choose the type of section you want to add to your {noun}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Section Type</label>
            <Select value={sectionType} onValueChange={setSectionType}>
              <SelectTrigger data-testid="select-section-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Section Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter section name..."
              data-testid="input-section-name"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-section">
              Cancel
            </Button>
            <Button onClick={create} disabled={isAdding} data-testid="button-create-section">
              {isAdding ? 'Adding...' : 'Add Section'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
