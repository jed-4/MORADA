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
- **Budget Tracking**: Manages estimates, bills, and variations with a calculation engine, storing real dollar values.
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop, task templates, inline checklist management, and due date filtering. Supports inline creation with contextual defaults, task duplication, and reminder setting. Reminders generate notifications with deep links.
- **Site Diary System**: Company-wide templates define form structure, project-specific entries record daily activities. Features include template import/export (Excel and JSON), deep search across field values, checkbox accountability, file/photo uploads, voice notes (mobile audio recording via expo-av), weather data recording, calendar view for entries, and PDF export for reports.
- **Checklist System**: Templates with group functionality, dashboard widget integration, and color-coded status indicators.
- **Cost Code Management**: Company-isolated merge functionality.
- **Import System**: Flexible CSV/Excel import for schedules with column mapping.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups.
- **Allowances System**: Tracks Prime Cost (PC) and Provisional Sum (PS) items.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, and template support.
- **User View Preferences**: Database-backed persistence for user-specific view settings (column order, visibility, filters).
- **Optimistic UI Updates**: Implemented for responsiveness.
- **Searchable Select Components**: Reusable typeahead components for dropdowns.
- **Calendar System**: Dual personal and business calendars with month/week/day views, drag-and-drop, Notion-style flexible filtering with saved views, and user timezone support.
- **Roles & Permissions**: Company-isolated user roles with granular control over 25 permissions. Built-in admin roles bypass checks.
- **Business Page Reorganization**: Unified navigation with a 2-row header and tab system.
- **Timesheets System**: Global access, compact table design, configurable columns, tabbed views, rapid approval modal, and company-level date format setting. Includes a subcontractor workflow with PO generation and status tracking.
- **User Workspace**: Customizable widget-based dashboard including personal widgets, resizing, drag-and-drop reordering, and saved views.
- **Notes & Memos**: Dedicated business/project notes and personal quick-capture memos.
- **Onboarding Flow**: Two-step process for user profile completion and company creation.
- **Activity Feed Settings**: Company-level settings to toggle visibility of activity types in the ActivityWidget.
- **Business Dashboard Views**: Database-backed views with company-wide access control and widget configuration persistence.
- **Schedule Widget**: Project dashboard schedule widget with multiple view modes (list, day, week, month), supporting stacked and timeline display.
- **Default Diary**: Weekly view of recurring tasks, with automated generation for current + next week, and template syncing to future uncompleted tasks.
- **Actionable Status Flag**: `isActionable` boolean flag for status categories to filter and highlight items requiring action.
- **Suppliers Migration**: Unified `suppliers` into `contacts` with `contactType='supplier'`, including contact merging and dedicated `contactInsurances` table.

### Mobile App (Expo/React Native)
- **Framework**: React Native with Expo SDK 52.
- **Location**: `/expo-mobile` directory.
- **Dashboard**: ClickUp-style home screen with greeting, horizontally scrollable category cards (Messages, Activity, Mentions, Assigned), collapsible sections (Today's Tasks, Overdue Tasks, Upcoming Tasks, Recent Activity, Calendar, Favourites, Timesheet), notification bell with unread badge, user menu with logout. Customizable layout via "Customize Home" settings (toggle visibility and reorder tiles/sections), persisted per user via user-view-preferences API.
- **Tasks Screen**: Dedicated tasks tab with list view and board/kanban view toggle, grouping by status/priority/project/due date, task view modal with full details, and inline edit mode for updating tasks.
- **Site Diary**: Template selector with pre-fetching and auto-select default in both Projects and More > Site Diary screens. Calendar popover with entry count dots. Voice notes with audio recording and playback. Deep search across field values.
- **Screens**: Login, Dashboard, Tasks, Projects List, Project Detail, Timesheets (clock in/out, log hours, week navigation, detail/edit/delete).
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