# Replit Configuration

## Overview
BuildPro is a project management software for Australian residential builders, offering a dashboard-centric interface for managing construction projects, tasks, schedules, and teams. It aims to streamline workflows, enhance collaboration, and provide robust financial oversight, including budget tracking. Key capabilities include a customizable widget-based dashboard and comprehensive task management with Kanban boards and calendar integration. The business vision is to simplify complex construction project management, improving efficiency and profitability for builders.

## Recent Changes (November 17, 2025)
- **Projects Board UX Enhancement** (COMPLETED): ClickUp 2025 aesthetic consistency and smart column widths
  - Changed groupBy icon from Users to Layers for clearer grouping representation
  - Updated column styling to match Tasks board: rounded-xl, bg-muted/20, border-border/50 for softer appearance
  - Badge styling uses lilac theme: bg-[#bba7db]/10, text-[#bba7db], border-[#bba7db]/20 with font-semibold
  - Cards updated with rounded-xl and transition-all duration-200 for smooth animations
  - Empty columns are now half-width (Small: 96px, Medium: 128px, Wide: 160px) to save horizontal space
  - Fixed critical drag bug: removed `.json()` call on already-parsed apiRequest response
  - Consistent ClickUp 2025 aesthetic throughout: ultra-subtle backgrounds (/20, /30 opacity), gentle borders, lilac accents

- **User Workspace Implementation** (COMPLETED): Comprehensive personal user workspace
  - Created `/users/:id` and `/me` routes with 2-row header matching Business page pattern
  - Built 5 workspace tabs: Overview (stats, AI placeholder, task widgets), Tasks (Board/List with assignee filtering), Schedule/Time/Notes (coming soon)
  - Updated sidebar with "Personal" section containing "My Workspace" link
  - Enhanced tasks API with assigneeId filtering that checks both assigneeId field and assignedTo array
  - Fixed routing: proper tab paths with slash separator, /me redirect with auth loading state
  - Removed standalone Gantt route - Gantt only accessible through Schedule page with ScheduleViewProvider

- **Header Company Button Enhancement** (COMPLETED): Improved styling and company name display with nickname support
  - Company button now styled as soft grey button: `bg-muted/60` with `hover-elevate` and `active-elevate-2`
  - Added `nickname` field to companies table for displaying shorter company name in header
  - Added `/api/companies/:id` endpoint to fetch company data by ID
  - Header now queries companies table to display actual company name instead of fallback "BuildPro"
  - Prioritizes: companySettings.companyName > company.nickname > company.name > "BuildPro" fallback
  - Button uses h-7 height, px-3 padding, rounded-md, font-semibold for clear clickable appearance

- **Gantt Chart User Preferences** (COMPLETED): Per-user view persistence
  - Implemented user view preferences using existing `userViewPreferences` API with viewKey "gantt"
  - Persists column widths, visible columns, zoom level, left panel width, and column order
  - Auto-saves with 1-second debounce when preferences change
  - Loads saved preferences on mount, falls back to defaults if none exist
  - Each user has independent Gantt view settings that persist across sessions
  
- **Gantt Chart UX Improvements** (COMPLETED): Enhanced column resizing and visual clarity
  - Added right-side resizer handle to assignee column for bidirectional resizing
  - Fixed main panel divider constraints: min 40px (allows collapsing columns), max totalPanelWidth (right edge of assignee column)
  - Panel divider acts as viewport control - hiding/showing columns without affecting their stored widths
  - Removed "Notes" column header text to reduce visual clutter in compact column
  - Changed day format from 3-letter abbreviations (Mon, Tue) to cleaner 2-letter format (Mo, Tu, We, Th, Fr, Sa, Su)
  - Improved header spacing and readability, less "boxy" appearance
  
- **Two-Step Onboarding Flow** (COMPLETED): Split onboarding into profile completion and company creation
  - Step 1: User completes profile (First Name, Last Name) with pre-fill from Replit Auth
  - Step 2: User creates company (name, ABN, address, phone, email, website)
  - Clear progression with "Step 1 of 2" / "Step 2 of 2" indicators
  - Button between steps: "Create Your Company" for clarity
  - User profile updated via API before transitioning to company setup
  - Maintains automatic General Manager role assignment with full permissions

## Previous Changes (November 16, 2025)
- **Business Page Reorganization** (COMPLETED): Unified business navigation with 2-row header and tab system
  - Created new `/business` route with 2-row header matching Tasks/Schedule pattern
  - Row 1: Page title ("Business") in compact h-9 header
  - Row 2: Horizontal tabs for all business sections (Overview, Projects, Tasks, Calendar, Expenses, Timesheets, Messages, Minutes, Leave, Team, Systems)
  - All business routes (`/business/*`, `/systems`, `/business-team`) now use single Business component with URL-based tab selection
  - Removed Business collapsible section from AppSidebar for cleaner navigation
  - Sidebar now shows only: My Calendar (standalone) + Projects (collapsible)
  - Company name in global header made larger (text-sm) and bold, links to `/business` page
  - Tab navigation uses lilac (#bba7db) active state matching design system
  - Deep linking preserved - URL changes with tab selection (/business/tasks, /business/calendar, etc.)

## Previous Changes (November 15, 2025)
- **Schedule Templates**: Full save/load functionality with frontend dialogs and secure backend API
  - Added `companyId` field to `scheduleTemplates` table (NOT NULL, FK to companies, cascade delete)
  - Storage layer enforces database-level filtering with SQL WHERE clauses for multi-tenant isolation
  - GET filters: `WHERE isArchived = false AND (companyId = $1 OR isPublic = true)`
  - UPDATE/DELETE enforce: `WHERE companyId = $1` to prevent cross-company tampering
  - Public templates are read-only (blocked from PATCH/DELETE operations)
  - All API routes require authentication and pass companyId to storage methods
  - Immutable fields (companyId, createdBy, isPublic) are server-managed and stripped from client updates
  - Template application verifies schedule, project, and user membership before applying
  - Built Save Template and Load Template dialogs in Schedule.tsx with category support

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state, React Context for UI state.
- **UI Framework**: Radix UI primitives with shadcn/ui.
- **Styling**: Tailwind CSS with a custom design system, supporting light/dark modes, a white & minimalist aesthetic with muted blue accents, and Inter font family.
- **Dashboard**: Widget-based with drag & drop, grid-based layout, and per-project localStorage persistence.
- **UI/UX Decisions**: Emphasis on a minimalist theme, column resizing for tables, and accessibility compliance. Design approach uses Buildern-style interfaces for familiarity.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful API (`/api` prefix).
- **Session Management**: Express sessions with PostgreSQL session store.
- **Error Handling**: Centralized middleware.

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
- **Budget Tracking**: Comprehensive management of estimates, bills, and variations with a calculation engine.
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop.
- **Checklist System**: Templates with group functionality and dashboard widget integration.
- **Cost Code Management**: Merge functionality for consolidation, with company isolation.
- **Import System**: Flexible column mapping, auto-detection, and support for various CSV/Excel formats, including intelligent cost code matching and hierarchical group handling.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups with CRUD operations and visual containment (rounded-corner "bubbles").
- **Allowances System**: Tracking of Prime Cost (PC) and Provisional Sum (PS) items, integrating with estimates, bills, timesheets, and client invoices.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, template support, and archiving.
- **User Column Preferences**: Persistent storage for user-specific table column order, visibility, and width.
- **Optimistic UI Updates**: Implemented for improved responsiveness.
- **Estimate Enhancements**: Cost code dropdowns, loading states, cascading group selection, and improved bulk delete.
- **Estimate Status Badges**: Consistent status display across the application.
- **Calendar System**: Dual personal and business calendars with month/week/day views, drag-and-drop, and real-time updates. Features Notion-style flexible filtering with saved views for projects, status, event types (tasks, schedule items, Google Calendar), assignees, and date ranges.
- **Google Calendar Integration**: Per-user OAuth with encrypted token storage, PKCE flow, and API for connecting, disconnecting, and displaying read-only Google Calendar events in the personal calendar. Events are visually distinguished.
- **Roles & Permissions**: Company-isolated user roles with granular control over 25 Buildern permissions across 5 categories (Files, Admin, Sales, Projects, Financial). Includes role creation, editing, deletion (with validation), and drag-and-drop reordering. Critical middleware enforces `companyId` isolation.

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