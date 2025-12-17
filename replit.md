# Replit Configuration

## Overview
BuildPro is a project management software for Australian residential builders. Its purpose is to streamline workflows, enhance collaboration, and provide robust financial oversight, including budget tracking, through a dashboard-centric interface. Key capabilities include customizable widget-based dashboards, comprehensive task management with Kanban boards and calendar integration, and a system for managing construction projects, tasks, schedules, and teams. The business vision is to simplify complex construction project management, thereby improving efficiency and profitability for builders.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state, React Context for UI state.
- **UI Framework**: Radix UI primitives with shadcn/ui.
- **Styling**: Tailwind CSS with a custom design system, supporting light/dark modes, a white & minimalist aesthetic with muted blue accents, and Inter font family.
- **Dashboard**: Widget-based with drag & drop, a grid-based layout, and per-project localStorage persistence.
- **UI/UX Decisions**: Emphasis on a minimalist theme, column resizing for tables, and accessibility compliance, drawing inspiration from Buildern-style interfaces.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful API (`/api` prefix).
- **Session Management**: Express sessions with PostgreSQL session store.
- **Error Handling**: Centralized middleware.
- **Email Service**: Resend for transactional emails (user invitations).

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
- **Budget Tracking**: Manages estimates, bills, and variations with a calculation engine.
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop, including task templates with user-specific or role-based assignments. Task modal includes inline checklist management for viewing/adding/toggling checklist items.
- **Checklist System**: Templates with group functionality and dashboard widget integration. Dashboard widget features responsive multi-column layout (1/2/3 columns based on width), compact headers, and color-coded status indicators (amber for priority+actionable, green for actionable items).
- **Cost Code Management**: Merge functionality with company isolation.
- **Import System**: Flexible CSV/Excel import with column mapping and intelligent cost code matching. Schedule import functionality allows importing Excel/CSV files directly into project schedules using the same column mapping and preview system as schedule templates via `/api/schedule-items/bulk-create`.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups with CRUD operations.
- **Allowances System**: Tracks Prime Cost (PC) and Provisional Sum (PS) items, integrating with financial modules.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, and template support.
- **User View Preferences**: Database-backed persistence for user-specific view settings (column order, visibility, filters) across all pages, using `/api/user-view-preferences` with GET and POST.
- **Optimistic UI Updates**: Implemented for improved responsiveness.
- **Searchable Select Components**: Reusable typeahead components for dropdowns with many items (e.g., Cost Codes, Projects, Contacts, Users, Task Templates).
- **Calendar System**: Dual personal and business calendars with month/week/day views, drag-and-drop, and Notion-style flexible filtering with saved views.
- **Roles & Permissions**: Company-isolated user roles with granular control over 25 Buildern permissions.
- **Business Page Reorganization**: Unified navigation with a 2-row header and tab system.
- **Timesheets System**: Global access via All Items section, compact table design (h-7 rows, text-[11px], py-1 padding), configurable columns with localStorage persistence, tabbed views (Table/Weekly/Calendar). Weekly view shows user×days matrix with aggregated hours and totals. Rapidfire Approval Modal enables batch review of pending timesheets with inline editing, 15min rounding, missing info highlights, and "Approve & Next" workflow. Simplified status flow: Draft → Approved. Planned features: subcontractor-to-PO workflow.
- **User Workspace**: Personal workspace with tabs for Overview, Tasks, and future Schedule/Time/Notes. The Overview tab features a fully customizable widget-based dashboard with:
  - Personal widgets: My Tasks, My Calendar (task-based), Cross-Project Deadlines, Personal Metrics, Quick Actions (clock in/out, log time), My Memos, Day Calendar, Week Calendar
  - Day Calendar widget: Scrollable 24-hour timeline with all-day items pinned at top, configurable data sources (tasks, schedule, timesheets, Google Calendar, reminders)
  - Week Calendar widget: 7-column grid view with expandable day columns, show/hide more events per day
  - Widget resizing: Drag corner handle to resize widgets (snaps to 8-column grid), dimensions persisted in localStorage
  - Drag-and-drop widget reordering via @dnd-kit
  - Add/remove widgets with configuration dialogs
  - Saved views with create/delete/switch functionality
  - Default "Overview" view protected from deletion
  - localStorage persistence per user including widget dimensions
- **Notes & Memos**: Dedicated business/project notes and personal quick-capture memos.
- **Onboarding Flow**: Two-step process for user profile completion and company creation.
- **Activity Feed Settings**: Company Settings > Activity section allows toggling visibility of activity types (task, estimate, bill, variation, invoice, proposal, project, site_diary, other). Stored in `companySettings.activityTypesVisible` JSON field. ActivityWidget respects these settings and filters activities accordingly.
- **Schedule Widget**: Project dashboard schedule widget with multiple view modes (list, day, week, month). Settings configured via edit modal only (widget is display-only). Day/Week views support both stacked (simple list) and timeline (hourly scale) display modes with:
  - Header row with day names and navigation
  - All-day items section (pinned at top)
  - Scrollable hourly timeline with current time indicator (for timeline mode)
  - Configurable filters for tasks, milestones, priority, status
- **Default Diary**: Systems > Default Diary tab shows weekly view of recurring tasks. Allows filtering by user to see their "default week" schedule of active recurring tasks.
- **Suppliers Migration (Complete)**: Legacy `suppliers` table unified into `contacts` with `contactType='supplier'`. 
  - **Completed**: `bills.supplierId`, `rfqQuotes.supplierId`, `priceListItems.supplierId` now reference `contacts.id` instead of `suppliers.id`.
  - **Deprecated**: `suppliers`, `supplierLabels`, `supplierLabelAssignments`, `supplierInsurances`, `supplierContacts` tables marked deprecated but functional for backward compatibility.
  - **Contact Merge**: `mergeContacts()` handles bills, RFQs, favoriteSuppliers, scheduleItems, purchaseOrders, rfqQuotes, priceListItems, and contactInsurances correctly.
  - **Contact Insurances**: New `contactInsurances` table for tracking insurance documents for contact-based suppliers. API at `/api/contacts/:id/insurances`. ReminderProcessor checks both legacy supplierInsurances and new contactInsurances for expiry alerts.
  - **Insurance UI**: EditContactDialog includes ContactInsuranceSection for supplier-type contacts with full CRUD and expiry status badges.
  - **Legacy Limitation**: Old supplier sub-tables (supplierInsurances, supplierContacts, supplierLabels) still reference `suppliers.id` for existing data.

### Mobile App (Capacitor-based)
- **Framework**: React with Capacitor for native mobile features.
- **Location**: `/mobile` directory with separate build configuration.
- **Features Implemented**: ProjectTasks, ProjectScope, ProjectNotes, ProjectMinutes, ProjectDefects, ProjectTimesheets, ProjectSiteDiary.
- **Shared Components**: `SwipeableCard`, `BottomSheet`, `PullToRefresh`, mobile-optimized form components.
- **UX Patterns**: Pull-to-refresh, haptic feedback, FAB for adding items, search/filter chips.

## External Dependencies

### Core UI Libraries
- **Radix UI**: Primitive component library.
- **shadcn/ui**: Component library built on Radix UI.
- **Lucide React**: Icon library.
- **class-variance-authority**: For variant-based component APIs.
- **@dnd-kit**: For drag & drop functionality.
- **@tiptap/react**: Rich text editor.
- **@react-pdf/renderer**: PDF generation.

### Data and State Management
- **TanStack Query**: Server state management.
- **React Hook Form**: Form management and validation.
- **Hookform Resolvers**: Integration with validation libraries.

### Database and Backend
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe ORM.
- **connect-pg-simple**: PostgreSQL session store.
- **ws**: WebSocket library.

### Development and Build Tools
- **Vite**: Build tool and dev server.
- **esbuild**: JavaScript bundler.
- **tsx**: TypeScript execution.
- **PostCSS**: CSS processing.

### Styling and Design
- **Tailwind CSS**: Utility-first CSS framework.
- **clsx**: Utility for className strings.
- **tailwind-merge**: For merging Tailwind CSS classes.

### Date and Utility Libraries
- **date-fns**: Date utility library.
- **nanoid**: Unique string ID generator.

### Integrations
- **Google Calendar Integration**: Per-user OAuth for displaying read-only Google Calendar events.
- **Google Drive Integration**: Company-level OAuth connection with tokens stored encrypted. Enables a live Google Drive browser, per-project folder linking, company-wide file management, folder templates, and file attachments to BuildPro entities. Features include file upload/download, folder creation, file preview, and activity logging.
- **Resend**: Transactional email service.