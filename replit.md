# Replit Configuration

## Overview
BuildPro is a project management software for Australian residential builders, offering a dashboard-centric interface for managing construction projects, tasks, schedules, and teams. Key capabilities include a customizable widget-based dashboard, comprehensive task management with Kanban boards and calendar integration, and business operations tracking. The platform aims to streamline project workflows, enhance collaboration, and provide robust tools for financial oversight like budget tracking.

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

### Key Features and Implementations
- **Budget Tracking**: Comprehensive budget management with database schema, API routes, calculation engine, summary cards, and cost code breakdown. Integrates with estimates, bills, and variations for automatic calculations.
- **Task Management**: Kanban, List, and Calendar views with drag-and-drop, filter interface, and view deletion.
- **Checklist System**: Templates with group functionality, responsive table view, and dashboard widget.
- **Contact Management**: Improved form UX with structured address fields for future mapping integration.
- **Cost Code Management**: Merge functionality to consolidate duplicate cost codes.
- **Import System**: Enhanced dialog with flexible column mapping, auto-detection, and blank header handling.
- **Templates Hub**: Centralized "Templates" page with cards for various template types (e.g., Notes, Site Diary, Schedule), supporting phased rollouts with "Coming Soon" indicators.
- **Allowances System**: Track Prime Cost (PC) and Provisional Sum (PS) items from estimates through to final pricing and invoicing. PC items allow markup over supplier cost, PS items accumulate bills and timesheets. Integrates with Bills, Timesheets, and Client Invoices. Status tracking: Pending → In Progress → Finalized.
  - **List Page**: Estimate selector at top to filter allowances by estimate. Aligned columns for PC and PS tables (Description, Estimate Price, Status, Actual Price, Variance). PC items include editable markup column. Status displayed as colored badges (clickable to change) using field settings for customizable names and colors. Rows clickable to navigate to detail page (interactive cells use stopPropagation).
  - **Field Settings**: allowance.status field category with customizable status names and colors. Default statuses: Pending (yellow/F59E0B), In Progress (blue/3B82F6), Finalized (green/10B981).
  - **Detail Page (Foundation)**: Header displays allowance info with status badge, estimate/actual/variance. Back button navigation. PC/PS type detection for specialized interfaces (in progress).
  - **Bill Allocation (Complete)**: Bill line items can be allocated to PC/PS allowances with checkbox "Applies to Allowances" and dropdown selection. Saves to billLineItemAllowances table with proper create/update/delete handling.
  - **Timesheet Allocation (Backend Complete)**: Infrastructure added for PS allowance allocation including timesheetAllowances table, storage methods (get, create, update, delete), and API routes. UI integration pending.
  - **Client Invoice Integration (Pending)**: Allowance variance display in client invoices not yet implemented.
- **Timesheet Enhancements**: 15-minute time block intervals, standard work hours configuration in company settings, time picker auto-scroll to default hours, Excel export with filtering.
- **Proposals System**: Professional PDF proposal builder with live preview and section-based editing. Database schema enhanced with section types (cover_page, cover_letter, estimate, summary, allowances, closing_letter, attachments, terms_conditions, signature), template support, and flexible JSON content storage. Frontend features split-screen PDF builder (60% live preview, 40% section editor) using @react-pdf/renderer for instant PDF generation. Drag-drop section reordering with @dnd-kit. PDF components include Cover Page and Estimate sections with company branding integration. Supports PDF download, section templates, and visual editing. Backend workflow API endpoints for status transitions, acceptance tracking, and proposal-to-invoice conversion. Company branding settings for logo, colors (primary/secondary), fonts, and header/footer text.
  - **Estimate Section**: Full integration with existing estimates system. Section editor provides dropdown to select estimate, optional description field, and column visibility toggles (description, quantity, unit cost ex/inc tax, markup %, amount ex/inc tax, show subtotals, show $0 lines). PDF renders grouped tables by cost code with Jack App style (black group headers, clean rows). Subtotals and grand totals dynamically match enabled column toggles. API endpoint `/api/estimates/:id/full` fetches complete estimate data (estimate, groups, items). Null-safe calculations prevent NaN values from missing pricing data.
- **UI/UX**: White & minimalist theme, column resizing for tables, and accessibility compliance.

## External Dependencies

### Core UI Libraries
- **Radix UI**: Primitive component library.
- **shadcn/ui**: Component library built on Radix UI.
- **Lucide React**: Icon library.
- **class-variance-authority**: For variant-based component APIs.
- **@dnd-kit**: For drag & drop functionality.
- **@tiptap/react**: Rich text editor.

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