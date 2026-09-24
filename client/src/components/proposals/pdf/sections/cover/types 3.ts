import type { CoverFacts, CoverPalette } from './coverData';

export interface CoverTemplateProps {
  facts: CoverFacts;
  palette: CoverPalette;
  companyName: string;
  companyLogo?: string;
  companyPhone?: string;
}
