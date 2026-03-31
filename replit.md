# Replit Configuration

## Overview
BuildPro is a project management software for Australian residential builders. Its purpose is to streamline workflows, enhance collaboration, and provide robust financial oversight, including budget tracking, through a dashboard-centric interface. Key capabilities include customizable widget-based dashboards, comprehensive task management, and a system for managing construction projects, tasks, schedules, and teams. The project aims to simplify complex construction project management, improving efficiency and profitability for builders.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state, React Context for UI state.
- **UI Framework**: Radix UI primitives with shadcn/ui.
- **Styling**: Tailwind CSS with a custom design system, supporting light/dark modes, a white & minimalist aesthetic with muted blue accents, and Inter font family.
- **Dashboard**: Widget-based with drag & drop, a grid-based layout. Business dashboard views are database-backed with access control.
- **UI/UX Decisions**: Minimalist theme, column resizing for tables, accessibility compliance, inspired by Buildern-style interfaces.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful API (`/api` prefix).
- **Session Management**: Express sessions with PostgreSQL session store.
- **Error Handling**: Centralized middleware.

### Authentication
- **Custom Authentication**: Standalone email/password registration and login with bcrypt hashing.
- **Google OAuth**: Optional Google login with CSRF state token validation.
- **Session Security**: httpOnly cookies, secure in production, lax sameSite, 7-day TTL.
- **Account Linking**: Google accounts linked to existing users by email.
- **Password Reset**: Manager-initiated password reset via tokenized email links.

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database**: PostgreSQL with Neon serverless hosting.
- **Schema Management**: Drizzle Kit for migrations.
- **Connection Pooling**: Neon serverless connection pooling with WebSocket support.

### Development and Build
- **Build Tool**: Vite for frontend bundling.
- **Development Server**: Integrated Vite dev server with Express backend.
- **TypeScript**: Strict mode enabled with path mapping.
- **Module System**: ESM modules.
- **Project Structure**: Monorepo with client, server, and shared code.

### Feature Specifications & System Design
- **Client Invoice Improvements (v2)**: Auto-generated invoice numbers (project prefix + sequence), collapsible intro/closing text sections, locked contract pricing when estimate is approved/locked, configurable column display with drag-to-reorder (column picker popover with lock icon for required columns), inc/exc GST toggle, variations modal (approved-only selection), allowances modal (finalized PC/PS items from linked estimate), custom lines with name field. Backend: `GET /api/client-invoices/next-number`, allowances CRUD (`GET/POST/PATCH/DELETE`), variation PATCH for claim percent. Schema additions: `lockedContractPrice`, `columnConfig`, `showAmountsIncTax` on `clientInvoices`; `name` on `clientInvoiceItems`; `invoiceAllowances` junction table.
- **Client Invoice Layout (v3)**: Full-width single-column layout (removed right-side summary panel). New "Invoice Summary" card below costing sections with: left column breakdown (Contract Price, Variations, Allowances, Custom Lines, ex-GST, GST), right column grand total (3xl bold), paid/balance due. Inc/exc GST toggle moved to Invoice Summary card header. Column picker remains in Contract Price section.
- **Demo Data Seeder**: `server/seed-lenny.ts` seeds current account with 13 funny Australian celebrity contacts (clients: Steve & Terri Irwin, Dame Edna Everage, Bindi & Chandler Powell; suppliers: Paul Hogan's Plumbing, Kylie Minogue Kitchens, Hugh Jackman Joinery, etc.; trades: Cathy Freeman Concreting, Tim Minchin Tiling, Chris Hemsworth Electrical). 3 fully-linked projects across construction/pre-construction/lead phases with estimates, variations, invoices, bills, schedule, tasks, site diary. Idempotent (checks sentinel project name). Endpoints: `POST /api/demo/seed`, `GET /api/demo/status`. UI: "Demo Data" card in System Configuration page with seed button + seeded state indicator.
- **Budget Tracking**: Manages estimates, bills, and variations with a calculation engine, storing real dollar values.
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop, task templates, inline checklist management, and due date filtering. Supports inline creation with contextual defaults, task duplication, and reminder setting. Reminders generate notifications with deep links.
- **Site Diary System**: Company-wide templates define form structure, project-specific entries record daily activities. Features include template import/export (Excel and JSON), deep search across field values, checkbox accountability, file/photo uploads, voice notes (mobile audio recording via expo-av), weather data recording, calendar view for entries, and PDF export for reports.
- **Checklist System**: Templates with group functionality, dashboard widget integration, and color-coded status indicators.
- **Cost Code Management**: Company-isolated merge functionality.
- **Import System**: Flexible CSV/Excel import for schedules with column mapping.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups.
- **Allowances System**: Tracks Prime Cost (PC) and Provisional Sum (PS) items.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, and template support.
- **E-Notes Template System**: Named template sets (enoteTemplateSets table) allowing estimates to be saved as reusable E-Notes templates, with "Save as Template" and "Apply Template" flows (replace or merge) in EstimateEnotes.tsx. Template sets are managed in EstimateTemplates.tsx E-Notes tab.
- **Purchase Orders System**: Create POs from estimate items via bulk selection with GST mode (inclusive/exclusive/gst_free), delivery details (reference, attention, contact, address, instructions), print/PDF with delivery instructions, send to supplier with status locking, receive goods workflow, duplicate PO, and delete. Shopping cart icons on estimate items indicate linked POs.
- **AI Bill Reader**: OpenAI GPT-4o vision-based invoice/bill extraction replacing Mindee OCR. Extracts supplier, dates, reference, line items, quantities, unit prices, tax, and totals from uploaded images/PDFs. Auto-fills bill form fields.
- **Xero Integration**: OAuth2 connection flow with token storage and auto-refresh. Bills with "Send to Xero" checkbox push to Xero as AP invoices on save. Xero connection management in Business Settings > Integrations.
- **Bill Attachment Viewer**: Inline preview of PDF and image attachments in bill sidebar with click-to-expand fullscreen overlay.
- **User View Preferences**: Database-backed persistence for user-specific view settings (column order, visibility, filters).
- **Optimistic UI Updates**: Implemented for responsiveness.
- **Searchable Select Components**: Reusable typeahead components for dropdowns.
- **Calendar System**: Dual personal and business calendars with month/week/day views, drag-and-drop, Notion-style flexible filtering with saved views, and user timezone support.
- **Roles & Permissions**: Company-isolated user roles with granular control over 25 permissions. Built-in admin roles bypass checks.
- **Business Page Reorganization**: Unified navigation with a 2-row header and tab system.
- **Timesheets System**: Global access, compact table design, configurable columns, tabbed views, rapid approval modal, and company-level date format setting. Includes a subcontractor workflow with PO generation and status tracking.
- **User Workspace**: Customizable widget-based dashboard including personal widgets, resizing, drag-and-drop reordering, and saved views.
- **Notes & Memos**: Dedicated business/project notes and personal quick-capture memos. Redesigned as a Notion-like split-panel interface: left panel (w-72) shows grouped/pinned notes list with search, sort, groups, archive toggle; right panel hosts inline block editor (NotionEditor) with auto-save (800ms debounce). New notes created immediately on click.
- **Docs**: Company-level documentation hub (SOPs, procedures, guides) at `/docs`. Split-panel layout: left panel shows folders (collapsible, context menu for create/rename/delete) and unfiled docs; right panel hosts the same NotionEditor with auto-save. Tables: `doc_folders`, `docs`. API: `/api/docs`, `/api/doc-folders`. Accessible from the sidebar System section.
- **NotionEditor**: Shared TipTap-based block editor component (`client/src/components/NotionEditor.tsx`). BubbleMenu on selection (Bold, Italic, Underline, Strike, H1-H3, clear format). FloatingMenu on empty paragraphs (block type picker). Slash command menu via "/" trigger. Extensions: StarterKit, Underline, TextStyle, TaskList, TaskItem. Props: content (HTML), onChange(html, text), placeholder, className, editable.
- **Onboarding Flow**: Two-step process for user profile completion and company creation.
- **Activity Feed Settings**: Company-level settings to toggle visibility of activity types in the ActivityWidget.
- **Business Dashboard Views**: Database-backed views with company-wide access control and widget configuration persistence.
- **Schedule Widget**: Project dashboard schedule widget with multiple view modes (list, day, week, month), supporting stacked and timeline display. Weekend muting and detail modal on click.
- **Schedule Improvements**: Working days system (Saturday/Sunday toggles + non-working days/holidays), named baselines with ghost bar rendering on Gantt, sub-items (formerly "steps") within schedule items with reordering, parent auto-completion calculation, lock/unlock edit workflow with beforeunload guard, CSV export, checklist/task linking, client visibility weeks, consolidated toolbar dropdown, baseline selector. Per-item weekend override toggle, trade/contact schedule colour picker with Gantt bar colouring, task linking with relative date offsets, week start day from company settings, right-click context menu on Gantt bars with duplicate action. Company-wide non-working days (in Business Settings > Schedule Settings) separate from schedule-specific non-working days, with merged display in schedule dialog. Company-level default client visibility weeks setting with per-schedule override. Inline assignee editing in Gantt table via ContactSelect popover. Parent items (Level 1) hide status/assignee/color as containers.
- **Company Workload Planner**: Resource planner with Gantt-style horizontal bars, dynamic viewport-filling timeline, weekend half-width columns, expandable/collapsible assignee rows, click-to-open item detail dialog, overload warning indicators (amber/red), and filter popover for hiding/showing assignees and projects.
- **Business Schedule Three-Tab View**: Business > Schedule now has three sub-tabs — Projects (existing per-project Gantt bar view), Workload (trade/assignee planner), and Schedules (new master Gantt). All three share a consistent tab strip with icons.
- **Master Schedules Gantt**: Cross-project windowed Gantt view (2/4/6 week window, prev/today/next navigation). Each project is a collapsible parent row with a full-span project bar (light project colour fill). Expanded projects show all schedule items as sub-rows with light colour fills; company-assigned items render darker. Vertical milestone lines span each project's rows for contract and build-start/end dates. Weekend shading, week gridlines, and today line included.
- **Schedule Milestones in Project Settings**: New "Schedule Milestones" card in Project Settings. Contract Start/End date pickers (saved immediately, shown as red dashed vertical lines on Gantts). Schedule Item milestone selectors — pick any schedule item as the "Build Start" or "Build End" marker (shown as solid coloured vertical lines). These lines appear on both the individual project Gantt and the master Schedules view. DB columns: `contract_start_date`, `contract_end_date`, `milestone_start_item_id`, `milestone_end_item_id` on `business_schedule_projects` table.
- **Project Creation**: Team member selection during project creation with auto-add for admin roles.
- **Default Diary**: Weekly view of recurring tasks, with automated generation for current + next week, and template syncing to future uncompleted tasks.
- **Actionable Status Flag**: `isActionable` boolean flag for status categories to filter and highlight items requiring action.
- **Suppliers Migration**: Unified `suppliers` into `contacts` with `contactType='supplier'`, including contact merging and dedicated `contactInsurances` table.
- **Business Overheads CFO Dashboard**: New "Overheads" tab in Business page. 4 sub-tabs: Register (spreadsheet by category/item with frequency, budget, Xero account code, monthly equivalent), Monthly Actuals (12-month editable grid per item with green confirmation chips per month), Forecast (last-12-month bar chart vs budget, next-12-month projection, KPI cards), OH Predictor (breakeven revenue calculator, weighted pipeline jobs, traffic light coverage indicator). Schema: `overhead_categories`, `overhead_items`, `overhead_month_actuals`, `overhead_month_status`, `company_oh_settings`, `oh_pipeline_jobs`, `oh_frequency` enum. API: `/api/overheads` (GET all), CRUD endpoints for categories/items/actuals/pipeline/settings, `/api/xero/overhead-actuals` (P&L report import). `XeroService.getProfitAndLossReport()` added.

### Mobile App (Expo/React Native)
- **Framework**: React Native with Expo SDK 52.
- **Location**: `/expo-mobile` directory.
- **Dashboard**: ClickUp-style home screen with greeting, horizontally scrollable category cards (Messages, Activity, Mentions, Assigned), collapsible sections (Today's Tasks, Overdue Tasks, Upcoming Tasks, Recent Activity, Calendar, Favourites, Timesheet), notification bell with unread badge, user menu with logout. Customizable layout via "Customize Home" settings (toggle visibility and reorder tiles/sections), persisted per user via user-view-preferences API.
- **Tasks Screen**: Dedicated tasks tab with list view and board/kanban view toggle, grouping by status/priority/project/due date, task view modal with full details, and inline edit mode for updating tasks.
- **Site Diary**: Template selector with pre-fetching and auto-select default in both Projects and More > Site Diary screens. Calendar popover with entry count dots. Voice notes with audio recording and playback. Deep search across field values.
- **Notes**: Notion-like notes experience accessible from More tab. NotesListScreen shows personal notes with search, pin/unpin, archive, delete (long-press actions). NoteEditorScreen provides a block-based editor with block types: text, H1, H2, bullet, numbered, todo (with checkbox toggle), divider. Keyboard toolbar for block type switching. Auto-save with 1.5s debounce via PATCH. Content stored as HTML (`contentHtml`) compatible with web NotionEditor, plus plain text (`contentText`). Notes synced with web app via existing `/api/notes` endpoints.
- **Screens**: Login, Dashboard, Tasks, Projects List, Project Detail, Timesheets (clock in/out, log hours, week navigation, detail/edit/delete), Notes List, Note Editor.
- **Navigation**: React Navigation with bottom tabs (Workspace, Projects, Tasks, Timesheets, More) and native stack.
- **Dark Mode**: Automatic via useColorScheme.
- **Backend Connection**: Uses same Express API on port 5000, session-based auth via X-Session-ID header.

## External Dependencies

### Core UI Libraries
- **Radix UI**: Primitive component library.
- **shadcn/ui**: Component library built on Radix UI.
- **Lucide React**: Icon library.
- **@dnd-kit**: For drag & drop functionality.
- **@tiptap/react**: Rich text editor.
- **@react-pdf/renderer**: PDF generation.

### Data and State Management
- **TanStack Query**: Server state management.
- **React Hook Form**: Form management and validation.

### Database and Backend
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe ORM.
- **connect-pg-simple**: PostgreSQL session store.
- **ws**: WebSocket library.
- **Resend**: Transactional email service.

### Development and Build Tools
- **Vite**: Build tool and dev server.
- **esbuild**: JavaScript bundler.
- **tsx**: TypeScript execution.

### Styling and Design
- **Tailwind CSS**: Utility-first CSS framework.

### Date and Utility Libraries
- **date-fns**: Date utility library.
- **nanoid**: Unique string ID generator.

### Integrations
- **Google Calendar Integration**: Per-user OAuth for displaying read-only events.
- **Google Drive Integration**: Company-level OAuth for live Google Drive browser, folder linking, file management, and attachments.
- **Replit Object Storage**: File upload support via presigned URLs using @uppy/core, @uppy/dashboard, @uppy/aws-s3.