# Replit Configuration

## Overview
BuildPro is a project management software designed for Australian residential builders. Its primary purpose is to streamline workflows, enhance collaboration, and provide robust financial oversight, including budget tracking, through a dashboard-centric interface. Key capabilities include customizable widget-based dashboards, comprehensive task management with Kanban boards and calendar integration, and a system for managing construction projects, tasks, schedules, and teams. The business vision is to simplify complex construction project management, thereby improving efficiency and profitability for builders.

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
- **Email Service**: Resend for transactional emails (user invitations). Configured with RESEND_API_KEY environment secret.

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
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop, including task templates with user-specific or role-based assignments.
- **Checklist System**: Templates with group functionality and dashboard widget integration.
- **Cost Code Management**: Merge functionality with company isolation.
- **Import System**: Flexible CSV/Excel import with column mapping and intelligent cost code matching.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups with CRUD operations.
- **Allowances System**: Tracks Prime Cost (PC) and Provisional Sum (PS) items, integrating with financial modules.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, and template support.
- **User View Preferences**: Database-backed persistence for user-specific view settings across all pages:
  - API: `/api/user-view-preferences` with GET by viewKey and POST to save
  - Stores column order, visibility, width, filters, and other view-specific settings
  - Persists across sessions, devices, and environments (dev/production have separate databases per user)
  - Pages using database-backed preferences: EstimateDetail, Tasks, BusinessTasks, BusinessProjects, Gantt
  - Pattern: Load on mount with useQuery, apply with useEffect, auto-save with debounced useMutation
  - Console logging with `[PageName]` prefix for debugging preference load/save operations
- **Optimistic UI Updates**: Implemented for improved responsiveness.
- **Estimate Enhancements**: Cost code dropdowns, loading states, cascading group selection, and improved bulk delete.
- **Searchable Select Components**: Reusable typeahead components for dropdowns with many items:
  - `SearchableSelect.tsx`: Base component with search filtering and keyboard navigation.
  - `CostCodeSelect.tsx`: Searchable dropdown for 100+ cost codes, used in Estimates, Bills, Timesheets.
  - `ProjectSelect.tsx`: Searchable project dropdown used in Tasks, Timesheets, FolderTree.
  - `ContactSelect.tsx`: Searchable contact dropdown used in Schedule.
  - `UserSelect.tsx`: Searchable user/assignee dropdown used in Tasks, Timesheets, TaskLibrary, FolderTree.
  - `TaskTemplateSelect.tsx`: Searchable task template dropdown for task creation.
- **Estimate Status Badges**: Consistent status display.
- **Calendar System**: Dual personal and business calendars with month/week/day views, drag-and-drop, and Notion-style flexible filtering with saved views.
- **Google Calendar Integration**: Per-user OAuth for displaying read-only Google Calendar events.
- **Roles & Permissions**: Company-isolated user roles with granular control over 25 Buildern permissions.
- **Business Page Reorganization**: Unified navigation with a 2-row header and tab system for various business sections.
- **User Workspace**: Personal workspace with tabs for Overview, Tasks, and future Schedule/Time/Notes.
- **Notes & Memos**: Dedicated business/project notes and personal quick-capture memos, with distinct UX.
- **Onboarding Flow**: Two-step process for user profile completion and company creation.

### Mobile App (Capacitor-based)
- **Framework**: React with Capacitor for native mobile features.
- **Location**: `/mobile` directory with separate build configuration.
- **Features Implemented**:
  - **ProjectTasksTab**: Task list with search, status filters, swipe-to-complete/delete, detail sheet.
  - **ProjectScopeTab**: Scope stages with collapsible sections, items list, swipe actions, add/view sheets.
  - **ProjectNotesTab**: Notes list with search, pin/unpin swipe, delete swipe, category filtering.
  - **ProjectMinutesTab**: Meeting minutes with attendee display, AI summary preview, add/view sheets.
  - **ProjectDefectsTab**: Defects with priority/status filtering, resolve/delete swipe actions.
  - **ProjectTimesheetsTab**: Clock in/out functionality, week navigation, time entry management.
  - **ProjectSiteDiaryTab**: Date navigation with quick date buttons, weather display, entry management.
- **Shared Components**:
  - `SwipeableCard`: Touch swipe gestures for left/right actions.
  - `BottomSheet`: Slide-up sheets for add/edit/detail views.
  - `PullToRefresh`: Pull-to-refresh for data reloading.
  - `MobileInput/MobileTextarea/MobileButton`: Mobile-optimized form components.
- **UX Patterns**: Pull-to-refresh, haptic feedback, FAB for adding items, search/filter chips.
- **API Pattern**: Uses `/api/projects/:projectId/...` for project-scoped resources.

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