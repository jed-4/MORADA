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
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop, including task templates with user-specific or role-based assignments.
- **Checklist System**: Templates with group functionality and dashboard widget integration.
- **Cost Code Management**: Merge functionality with company isolation.
- **Import System**: Flexible CSV/Excel import with column mapping and intelligent cost code matching.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups with CRUD operations.
- **Allowances System**: Tracks Prime Cost (PC) and Provisional Sum (PS) items, integrating with financial modules.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, and template support.
- **User View Preferences**: Database-backed persistence for user-specific view settings (column order, visibility, filters) across all pages, using `/api/user-view-preferences` with GET and POST.
- **Optimistic UI Updates**: Implemented for improved responsiveness.
- **Searchable Select Components**: Reusable typeahead components for dropdowns with many items (e.g., Cost Codes, Projects, Contacts, Users, Task Templates).
- **Calendar System**: Dual personal and business calendars with month/week/day views, drag-and-drop, and Notion-style flexible filtering with saved views.
- **Roles & Permissions**: Company-isolated user roles with granular control over 25 Buildern permissions.
- **Business Page Reorganization**: Unified navigation with a 2-row header and tab system.
- **User Workspace**: Personal workspace with tabs for Overview, Tasks, and future Schedule/Time/Notes.
- **Notes & Memos**: Dedicated business/project notes and personal quick-capture memos.
- **Onboarding Flow**: Two-step process for user profile completion and company creation.

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