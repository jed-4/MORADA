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
**Hierarchy (enhanced for stronger contrast and better readability):**
- H1/H2: 700 weight (bold), 1.5rem to 2.25rem
- H3/H4: 600 weight (semibold), 1.125rem to 1.25rem  
- Labels: 600 weight (semibold) - all form labels are bolder for clarity
- Buttons: 600 weight (semibold) - enhanced from medium for better emphasis
- Table Headers: 600 weight (semibold) - improved from medium weight
- Card Titles: 700 weight (bold) - stronger emphasis for section headers
- Dialog Titles: 700 weight (bold) - clear modal hierarchy
- Body Text: 400-500 weight, 0.875rem to 1rem
- Captions: 400 weight, 0.75rem

**Text Hierarchy Classes:**
- `.text-primary-emphasis`: 600 weight, full foreground color (important content)
- `.text-secondary-emphasis`: 500 weight, full foreground color (regular content)
- `.text-tertiary`: 400 weight, muted foreground color (supporting content)
- Key principle: Bold headings and labels create clear visual hierarchy with strong contrast against body text

### C. Layout System
**Spacing Units:** Tailwind units with minimalist approach
- Compact data displays: p-3, gap-2
- Standard sections: p-4, gap-3, m-3
- Major layout divisions: p-6, gap-6

**Visual Hierarchy:**
- Rely on typography weight, size, and generous whitespace
- **Stronger borders (2px)** for better visual definition and clarity
- Minimal elevation changes - content speaks for itself
- Intentional use of color for CTAs and status only

**Border System (Enhanced for Better Visibility):**
- Cards: 2px borders for clear separation
- Form Inputs: 2px borders (Input, Select, Textarea) for better focus
- Buttons: 2px borders for stronger definition
- Badges: 2px borders for visual prominence
- Tables: 2px borders for clearer data separation
- Popovers/Dialogs: 2px borders for modal emphasis
- Principle: Thicker borders improve visual hierarchy without adding visual weight

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

**BuildPro Control Header (Standard Page Header Pattern):**
The BuildPro Control Header is a 3-row header structure used across task management, schedule, and template pages for consistency:

*Row 1 - Title & Actions (36px / h-9):*
- Left: Page title (text-sm font-semibold), count badge (Badge variant="secondary")
- Right: Primary action buttons using lilac accent (#bba7db), gear icon for settings
- Layout: `h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0`

*Row 2 - Views & Options (36px / h-9):*
- Left: View toggle tabs (Board/List/Calendar/Gantt) with lilac active state
- Active tab style: `bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90`
- Inactive tab style: `hover-elevate active-elevate-2`
- Right: More options dropdown, saved views management
- Layout: `h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0`

*Row 3 - Search & Filters (36px / h-9):*
- Left: Search input (w-48, h-6, text-xs), filter dropdowns with badge counts
- Right: View-specific controls (zoom, columns, card width, group by)
- Layout: `h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0`

*Common Design Tokens:*
- Button heights: h-6 for compact toolbar buttons
- Text size: text-xs for all header controls
- Icon size: h-3 w-3 / h-4 w-4
- Spacing: gap-0.5 for tabs, gap-1.5 for button groups, gap-4 for major sections
- Border: border rounded-md for all interactive elements
- Interactions: hover-elevate, active-elevate-2 for buttons

*When to use:*
- All template detail pages (Schedule, Estimate, Task, etc.)
- Task management views (project tasks, business tasks)
- Schedule/Gantt views
- Any page with view toggles and filtering capabilities

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