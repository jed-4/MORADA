# Replit Configuration

## Overview
BuildPro is a project management software for Australian residential builders, offering a dashboard-centric interface for managing construction projects, tasks, schedules, and teams. It aims to streamline workflows, enhance collaboration, and provide robust financial oversight, including budget tracking. Key capabilities include a customizable widget-based dashboard and comprehensive task management with Kanban boards and calendar integration. The business vision is to simplify complex construction project management, improving efficiency and profitability for builders.

## Recent Changes (November 15, 2025)
- **Schedule Templates**: Implemented save/load functionality with frontend dialogs and backend API
  - Added `companyId` field to `scheduleTemplates` table for multi-tenant isolation
  - Created POST `/api/schedule-templates/:id/apply` endpoint to apply templates to schedules
  - Built Save Template and Load Template dialogs in Schedule.tsx
  - Route-level authorization checks enforce company ownership
  - **Future Work**: Storage layer needs hardening to enforce companyId filtering at the database query level (currently filtered at route level)

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