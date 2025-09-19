# Project Management Software Design Guidelines

## Design Approach
**Design System Approach**: Material Design - optimized for productivity and information-dense applications with strong visual feedback suitable for construction industry workflows.

**Key Design Principles:**
- Professional construction industry aesthetic with clean, organized layouts
- Clear visual hierarchy for complex project data
- Efficient navigation between projects and modules
- Dashboard-centric design optimized for quick decision making

## Core Design Elements

### A. Color Palette
**Primary Colors:**
- Dark Mode: 220 15% 12% (dark slate background), 220 25% 20% (card backgrounds)
- Light Mode: 220 5% 98% (light background), 0 0% 100% (card backgrounds)
- Brand Primary: 210 90% 50% (professional blue for CTAs and active states)
- Secondary: 220 10% 65% (muted text and borders)

**Accent Colors:**
- Success: 142 70% 45% (project completion, task done)
- Warning: 38 85% 60% (deadlines, pending items)
- Error: 0 75% 55% (overdue tasks, critical issues)

### B. Typography
**Font Families:** Inter (primary), JetBrains Mono (code/data)
**Hierarchy:**
- Headers: 600 weight, 1.5rem to 2.25rem
- Body: 400-500 weight, 0.875rem to 1rem
- Captions: 400 weight, 0.75rem

### C. Layout System
**Spacing Units:** Tailwind units of 2, 4, 6, 8, 12, 16
- Compact data displays: p-2, gap-2
- Standard sections: p-4, gap-4, m-4
- Major layout divisions: p-8, gap-8

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