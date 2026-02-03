# Replit Configuration

## Overview
BuildPro is a project management software designed for Australian residential builders. Its primary goal is to streamline workflows, enhance collaboration, and provide robust financial oversight, including budget tracking, through a dashboard-centric interface. Key features include customizable widget-based dashboards, comprehensive task management with Kanban boards and calendar integration, and a system for managing construction projects, tasks, schedules, and teams. The business vision is to simplify complex construction project management, thereby improving efficiency and profitability for builders.

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
- **Email Service**: Resend for transactional emails.

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
- **Budget Tracking**: Manages estimates, bills, and variations with a calculation engine.
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop, task templates, inline checklist management, and due date filtering. Polymorphic task context model for consistent handling across projects and business.
- **Checklist System**: Templates with group functionality and dashboard widget integration, color-coded status indicators. **Terminology mapping**: Database `checklistTemplates` table = UI "Checklist Group" (e.g., "01 Estimation"); Database `checklistTemplateGroups` table = UI "Checklist" (e.g., "EST04 - RFQs Issued"); Database `checklistTemplateItems` table = UI "Checklist Item" (e.g., "Prepare RFQs").
- **Cost Code Management**: Company-isolated merge functionality.
- **Import System**: Flexible CSV/Excel import for schedules with column mapping.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups.
- **Allowances System**: Tracks Prime Cost (PC) and Provisional Sum (PS) items.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, and template support.
- **User View Preferences**: Database-backed persistence for user-specific view settings (column order, visibility, filters).
- **Optimistic UI Updates**: Implemented for responsiveness.
- **Searchable Select Components**: Reusable typeahead components for dropdowns.
- **Calendar System**: Dual personal and business calendars with month/week/day views, drag-and-drop, and Notion-style flexible filtering with saved views. **Timezone Support**: All date/time displays respect user's selected timezone (User Settings > Preferences > Display Timezone). Uses `useTimezone` hook with `formatInTimezone` and `formatDateTimeInTimezone` utilities for consistent formatting across all components.
- **Roles & Permissions**: Company-isolated user roles with granular control over 25 permissions. Built-in admin roles (General Manager, Admin, Owner) automatically bypass permission checks for full access.
- **Business Page Reorganization**: Unified navigation with a 2-row header and tab system.
- **Timesheets System**: Global access, compact table design, configurable columns, tabbed views (Table/Weekly/Calendar), rapid approval modal.
- **User Workspace**: Default landing page after login, fully customizable widget-based dashboard including personal widgets (My Tasks, My Calendar, Cross-Project Deadlines, Quick Actions, Memos, Day/Week Calendar), widget resizing, drag-and-drop reordering, and saved views.
- **Notes & Memos**: Dedicated business/project notes and personal quick-capture memos.
- **Onboarding Flow**: Two-step process for user profile completion and company creation.
- **Activity Feed Settings**: Company-level settings to toggle visibility of activity types in the ActivityWidget.
- **Business Dashboard Views**: Database-backed views with company-wide access control, supporting view creation/deletion, access control (everyone/roles/users/private), and widget configuration persistence to the database.
- **Schedule Widget**: Project dashboard schedule widget with multiple view modes (list, day, week, month), supporting stacked and timeline display modes with configurable filters.
- **Default Diary**: Weekly view of recurring tasks, with automated generation of recurring tasks from templates. **Two-Week Pre-Generation**: Tasks are generated for current week + next week (14 days ahead). **Template Sync**: Editing a recurring template automatically syncs changes to all future uncompleted tasks (preserving completed checklist items).
- **Actionable Status Flag**: `isActionable` boolean flag for status categories to filter and highlight items requiring action in widgets.
- **Suppliers Migration**: Unified `suppliers` into `contacts` with `contactType='supplier'`, updating all related references. Includes contact merging and dedicated `contactInsurances` table with UI for supplier-type contacts.

### Mobile App (Capacitor-based)
- **Framework**: React with Capacitor.
- **Location**: `/mobile` directory.
- **Features Implemented**: ProjectTasks, ProjectScope, ProjectNotes, ProjectMinutes, ProjectDefects, ProjectTimesheets, ProjectSiteDiary.
- **Shared Components**: `SwipeableCard`, `BottomSheet`, `PullToRefresh`, mobile-optimized forms.
- **UX Patterns**: Pull-to-refresh, haptic feedback, FAB, search/filter chips.

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
- **Google Calendar Integration**: Per-user OAuth for displaying read-only events.
- **Google Drive Integration**: Company-level OAuth for live Google Drive browser, folder linking, file management, and attachments.
- **Replit Object Storage**: File upload support via presigned URLs using @uppy/core v5, @uppy/dashboard, @uppy/aws-s3. Two-step flow: request presigned URL with metadata, then upload directly to GCS.
- **Resend**: Transactional email service.

### File Attachments
- **Task Attachments**: Tasks support file attachments via dropdown menu with "Upload File" (Object Storage) and "From Google Drive" options.
- **Upload Flow**: Presigned URL flow with useUpload hook, ObjectUploader component, and /api/uploads/request-url endpoint.
- **Storage**: Files stored in Replit Object Storage with public/private directory structure.