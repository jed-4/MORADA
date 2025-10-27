# Replit Configuration

## Overview
BuildPro is a project management software designed for Australian residential builders. It provides a dashboard-centric interface for managing construction projects, tasks, schedules, and teams. The platform aims to streamline project workflows, enhance collaboration, and offer robust tools for financial oversight, including budget tracking. Key capabilities include a customizable widget-based dashboard and comprehensive task management with Kanban boards and calendar integration. The business vision is to provide a comprehensive solution that simplifies complex construction project management, offering significant market potential by improving efficiency and profitability for builders.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state, React Context for UI state.
- **UI Framework**: Radix UI primitives with shadcn/ui component library.
- **Styling**: Tailwind CSS with a custom design system.
- **Theme System**: Custom theme provider supporting light/dark modes, with a white & minimalist aesthetic, muted blue accents (HSL 215 35% 45%), and accessible contrast ratios.
- **Typography**: Inter font family.
- **Dashboard**: Widget-based with drag & drop functionality, grid-based layout, and per-project localStorage persistence.
- **UI/UX Decisions**: Emphasis on a white and minimalist theme, column resizing for tables, and accessibility compliance.
- **Design Approach**: Buildern-style interfaces for components like the import modal and pricing sections, providing a familiar and intuitive user experience.

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
- **Budget Tracking**: Comprehensive budget management integrating estimates, bills, and variations with a calculation engine.
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop.
- **Checklist System**: Templates with group functionality and dashboard widget integration.
- **Cost Code Management**: Merge functionality for consolidation.
- **Import System**: Flexible column mapping, auto-detection, and support for various CSV/Excel formats (e.g., Buildern, Wunderbuild). Includes specific handling for hierarchical groups and cost codes. Features intelligent cost code matching that matches imported values against company cost codes by code number, title, or "code - title" format (case-insensitive), with visual feedback showing matched (green badge with checkmark) vs unmatched (yellow badge with alert) codes in the import preview.
- **Hierarchical Groups for Estimates**: Unlimited-depth nesting for estimate groups with full CRUD operations and UI support (indentation, expand/collapse).
- **Allowances System**: Tracking of Prime Cost (PC) and Provisional Sum (PS) items, integrating with estimates, bills, timesheets, and client invoices. Features a list page with estimate filtering, editable markup for PC, status tracking, and bill allocation.
- **Proposals System**: PDF proposal builder with live preview, section-based editing, template support, and archiving capability. Features tabbed interface for active and archived proposals with counts. Utilizes `@react-pdf/renderer` for PDF generation and `@dnd-kit` for section reordering. Includes integration with estimates and company branding settings.
- **User Column Preferences**: Persistent storage and loading of user-specific column order, visibility, and width for tables, with auto-save and fallback to defaults.
- **Optimistic UI Updates**: Implemented for group expand/collapse and item additions to enhance responsiveness.
- **Estimate Detail Enhancements**: Cost code dropdowns connected to API, loading states, cascading group selection, and improved bulk delete functionality.
- **Estimate Status Badges**: Consistent status badge display across the application, configurable via field settings.
- **Estimate Group Visual Containment** (October 2025): Implemented rounded-corner visual containment for estimate groups with items. Groups display as unified "bubbles" with rounded-t-xl on headers, rounded-b-xl on last items, and full rounded-xl when collapsed. Items within groups receive subtle visual nesting (background tint bg-muted/10, 2px left border, 8px additional padding). CSS implemented via pseudo-elements on TableRows (group-row-shell with .group-collapsed/.group-expanded variants, item-in-group, item-in-group-last classes). Spacer rows (h-3 transparent) provide visual separation between top-level groups since table rows don't support margins.
- **Calendar System** (October 2025): Dual calendar structure with personal and business views. Personal calendar (accessible via header icon button) shows user's tasks across all projects with completion checkboxes and visual states. Business calendar (in business sidebar) displays all company events with project and user filtering. Both calendars integrate tasks and schedule items with month/week/day views, drag-and-drop support, and real-time status updates. Calendar removed from project sidebar as schedules are managed per-project.

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