# Project Management Software Design Guidelines

## Design Approach
**Design System Approach**: White & Minimalist - optimized for clarity, focus, and reduced visual noise while maintaining productivity for construction industry workflows.

**Key Design Principles:**
- Clean, minimalist aesthetic with generous white space
- Subtle visual hierarchy through typography and spacing
- Muted color palette with intentional accent colors
- Focus on content with minimal decorative elements

## Core Design Elements

### A. Color Palette
**Primary Colors:**
- Light Mode: 0 0% 99% (near-white background), 0 0% 100% (pure white cards)
- Brand Primary: 240 50% 65% (original periwinkle purple)
- Secondary: 240 30% 85% (light purple for subtle emphasis)
- Foreground: 220 12% 18% (dark text for strong readability)

**Neutral Colors:**
- Border: 220 6% 90% (subtle borders)
- Muted: 220 6% 94% (background variations)
- Muted Foreground: 220 10% 45% (secondary text)

**Accent Colors (unchanged for semantic meaning):**
- Success: 142 76% 36% (project completion, task done)
- Warning: 25 95% 53% (deadlines, pending items)
- Error: 0 84% 60% (overdue tasks, critical issues)

### B. Typography
**Font Families:** Inter (primary), JetBrains Mono (code/data)
**Hierarchy (enhanced for stronger contrast):**
- H1/H2: 700 weight (bold), 1.5rem to 2.25rem
- H3/H4: 600 weight (semibold), 1.125rem to 1.25rem  
- Body: 400-500 weight, 0.875rem to 1rem
- Captions: 400 weight, 0.75rem
- Key principle: Bold headings create clear visual hierarchy against body text

### C. Layout System
**Spacing Units:** Tailwind units with minimalist approach
- Compact data displays: p-3, gap-2
- Standard sections: p-4, gap-3, m-3
- Major layout divisions: p-6, gap-6

**Visual Hierarchy:**
- Rely on typography weight, size, and generous whitespace
- Use subtle borders (1px) instead of heavy shadows
- Minimal elevation changes - content speaks for itself
- Intentional use of color for CTAs and status only

### D. Component Library

**Navigation:**
- Persistent top navbar with dropdown menus for Projects and All Items
- Left sidebar for project sections (collapsible on mobile)
- Breadcrumb navigation within project sections

**Dashboard Components:**
- KPI cards with metric displays and trend indicators
- Project status overview with progress bars
- Quick action buttons for common tasks
- Recent activity feed with timestamps

**Task Management (Asana-style):**
- Kanban board view with drag-and-drop functionality
- List view with sorting and filtering controls
- Task cards with assignee avatars, due dates, priority indicators
- Bulk action controls and advanced filtering

**Data Tables:**
- Sortable column headers
- Row selection checkboxes
- Pagination controls
- Export functionality buttons

**Forms:**
- Grouped field layouts with clear labels
- Inline validation messages
- Multi-step forms for complex processes (estimates, RFQs)
- File upload areas with drag-and-drop

**Project Sections:**
- Tabbed interface for switching between project modules
- "Coming Soon" placeholders with descriptive text and estimated timelines
- Module-specific toolbars and actions

**Calendar Integration:**
- Month/week/day view toggle
- Project milestone markers
- Task deadline indicators
- Drag-and-drop scheduling

### E. Responsive Behavior
- Mobile-first approach with collapsible navigation
- Touch-friendly tap targets (minimum 44px)
- Horizontal scroll for data tables on mobile
- Simplified dashboard layout on smaller screens

### F. Industry-Specific Elements
- Australian building terminology and workflows
- Construction phase indicators
- Trade-specific task categories
- Regulatory compliance checklists
- Weather impact considerations for scheduling

## Images
No hero images required. Focus on:
- Placeholder construction site photos in project cards
- User avatars in task assignments
- Document thumbnails in file sections
- Progress visualization charts and graphs