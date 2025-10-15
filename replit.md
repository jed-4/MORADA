# Replit Configuration

## Overview

BuildPro is a comprehensive project management software designed specifically for Australian residential builders. The application provides a dashboard-centric interface for managing construction projects, tasks, schedules, and teams. It features a customizable widget-based dashboard system, comprehensive task management with Kanban boards, calendar integration, and business operations tracking. The platform is built with React and TypeScript on the frontend, Express.js on the backend, and uses PostgreSQL with Drizzle ORM for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### October 15, 2025
- **Cost Code Merge Functionality**: Implemented complete merge feature allowing users to consolidate duplicate cost codes with proper reference updating
- **MergeCostCodeDialog Component**: Created dialog with target cost code selection, visual previews of source/target codes with category details, and warning about irreversible action
- **Backend Merge Implementation**: Updated mergeCostCodes method to update all billLineItems references before archiving source code
- **Import Dialog Enhancement**: Changed import dialog from side drawer to large centered modal (max-w-6xl) for better usability with data tables
- **Import Bug Fixes**: Fixed SelectItem validation errors by using "__none__" sentinel value for optional category columns, added event prevention to file input handler

### October 13, 2025
- **Drag-Drop Persistence Architecture**: Refactored reordering system with container-scoped logic, proper cross-group moves with source/destination reindexing, and optimistic updates with snapshot/rollback for reliability
- **Description Dialog Overlay**: Redesigned rich text editor as proper Dialog overlay (Buildern-style), hoisted to component level to prevent per-row instances and layout issues
- **Buildern-Style Inline Grouping**: Transformed group rendering from separate Card bubbles to inline TableRow headers within single continuous table, using useSortable directly on TableRow for valid HTML structure
- **Valid Table Semantics**: Refactored to eliminate div wrappers inside tbody, ensuring proper table hierarchy (tbody→tr) while preserving drag-drop functionality for groups and items
- **Inline Editing UX Enhancement**: Changed all editable cells from single-click to double-click activation to prevent drag-drop pointer event conflicts
- **Rich Text Description Field**: Implemented inline rich text editor for item descriptions with formatting toolbar (bold, italic, underline, ordered/unordered lists)
- **HoverCard Preview**: Added hover preview for description field showing full formatted HTML content without needing to open editor
- **TipTap Integration**: Added @tiptap/extension-underline for complete rich text formatting support in descriptions

### October 8, 2025
- **Templates Hub Implementation**: Transformed Templates page into a central hub with cards for all template types: Notes, Site Diary, Schedule, Tasks, Take-offs, Estimates, RFQ, RFI, Proposal, Selections, Purchase Orders
- **Phased Rollout UX**: Implemented "Coming Soon" badges for unimplemented template types with visual indicators (reduced opacity, cursor-not-allowed) to prevent navigation to non-existent pages
- **Site Diary Templates Integration**: Only Site Diary templates are currently implemented and clickable, serving as the first fully-functional template management system
- **Navigation Cleanup**: Removed "Site Diary Templates" from sidebar since it's now accessed through the Templates hub

### October 3, 2025
- **White & Minimalist Theme Implementation**: Transformed entire UI to white & minimalist aesthetic with near-white backgrounds (HSL 0 0% 99%/98%/100%), muted blue primary color (HSL 215 35% 45%), reduced shadow intensity (50% less blur/opacity), and removed scale/translate animations for cleaner interactions
- **Accessibility Compliance**: Fixed primary button contrast ratio from 3.7:1 to 5.4:1 (WCAG AA compliant) by darkening primary color while maintaining minimalist look
- **Design System Update**: Updated design guidelines to reflect minimalist principles with typography-driven hierarchy, subtle visual distinctions, and flat backgrounds with 1px borders
- **Estimate Table Column Resizing**: Implemented fully functional column resizing with horizontal scroll support for estimates table
- **Architecture Fix**: Refactored from Tailwind classes to numeric pixel widths (widthPx) with colgroup architecture for stable column sizing
- **Overflow System**: Added proper flex constraints (min-w-0) to parent containers and overflow-x-auto to CardContent to enable horizontal scrolling when columns exceed viewport width
- **Table Layout**: Implemented table-layout: fixed with explicit width calculations from sum of visible column widths, ensuring smooth drag-to-resize with persistence in localStorage
- **Technical Solution**: Key fix was adding min-w-0 to flex parent containers and display: table to force width respect, preventing viewport clamping while maintaining responsive design

### September 24, 2025
- **Authentication System Fix**: Resolved critical login bug that was preventing all user access due to incorrect password hashing - implemented proper bcrypt validation
- **Color Theme Selection**: Conducted comprehensive color testing with 9 total theme variations including 5 pre-selected colors (Deep Forest Green, Charcoal Slate, Teal, Deep Purple, Olive Green) and 4 custom soft purple variations (Lavender, Muted Purple, Dusty Purple, Periwinkle)
- **Final Theme**: Selected Periwinkle soft blue-purple theme (HSL: 240 50% 65%) providing calming, professional aesthetic with excellent light/dark mode support
- **Live Theme System**: Implemented instant color switching across entire application including all UI components, buttons, links, and interactive elements

### September 23, 2025
- **Widget-Based Dashboard**: Implemented complete widget-based dashboard system similar to Buildern's approach with drag & drop functionality using @dnd-kit library
- **Project Settings UX**: Moved project settings access from sidebar to small header icon for better UX following Buildern's patterns
- **Enhanced Widgets Center**: Created sophisticated modal with grid layout, widget previews, and visual design matching industry standards
- **Widget Persistence**: Added per-project localStorage persistence for widget layouts, maintaining order, types, and configurations across sessions
- **Production-Ready Implementation**: Architect-validated code with robust error handling, accessibility compliance (44px touch targets), and comprehensive edge case handling

### September 22, 2025
- **Task View Management**: Added complete view deletion functionality with hover delete buttons on custom view tabs, confirmation dialogs, and smart tab switching when active view is deleted
- **Filter Interface Redesign**: Replaced single filter panel with horizontal bar of individual dropdown buttons below the views for improved usability and visual hierarchy
- **Enhanced UX**: Added active filter badges, "Clear All" functionality, and visual separation between views and filters using Material Design principles
- **Calendar View Implementation**: Added comprehensive calendar view as third default tab alongside Kanban and List views, featuring Day/Week/Month views, priority-based color coding, interactive task management with drag & drop date changes, and full integration with existing filter system

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for build tooling
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state and React Context for UI state
- **UI Framework**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design system optimized for construction industry workflows
- **Theme System**: Custom theme provider supporting light/dark modes with Material Design principles

### Component Design System
- **Design Approach**: White & minimalist aesthetic with typography-driven hierarchy and subtle visual distinctions
- **Color Palette**: Near-white backgrounds (99%, 98%, 100%), muted blue accents (HSL 215 35% 45%), accessible contrast ratios (≥4.5:1)
- **Layout System**: Tailwind spacing units with reduced shadows (50% intensity) and no transform animations
- **Typography**: Inter font family with defined hierarchy for headers, body text, and captions

### Dashboard Architecture
- **Widget System**: Customizable dashboard with draggable widgets for KPIs, tasks, schedules, and notes
- **Layout Management**: Grid-based layout system with configurable widget sizes (sm, md, lg, xl)
- **Widget Registry**: Centralized widget definition system for easy extensibility

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations
- **Database**: PostgreSQL with Neon serverless hosting
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection Pooling**: Neon serverless connection pooling with WebSocket support

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with /api route prefix
- **Session Management**: Express sessions with PostgreSQL session store
- **Error Handling**: Centralized error handling middleware
- **Development**: Hot reloading with Vite middleware integration

### Build and Development
- **Build Tool**: Vite for frontend bundling with React plugin
- **Development Server**: Integrated Vite dev server with Express backend
- **TypeScript**: Strict mode enabled with path mapping for clean imports
- **Module System**: ESM modules throughout the application

### Project Structure
- **Monorepo**: Client and server code in single repository
- **Shared Code**: Common TypeScript types and schemas in shared directory
- **Path Aliases**: Clean import paths using @ for client code and @shared for shared modules

## External Dependencies

### Core UI Libraries
- **Radix UI**: Comprehensive primitive component library for accessible UI components
- **shadcn/ui**: Pre-built component library built on Radix UI primitives
- **Lucide React**: Icon library for consistent iconography
- **class-variance-authority**: Utility for creating variant-based component APIs

### Data and State Management
- **TanStack Query**: Server state management with caching and synchronization
- **React Hook Form**: Form state management with validation
- **Hookform Resolvers**: Integration between React Hook Form and validation libraries

### Database and Backend
- **Neon Database**: Serverless PostgreSQL hosting platform
- **Drizzle ORM**: Type-safe ORM with PostgreSQL support
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### Development and Build Tools
- **Vite**: Fast build tool and development server
- **esbuild**: Fast JavaScript bundler for production builds
- **tsx**: TypeScript execution for development server
- **PostCSS**: CSS processing with Tailwind CSS and Autoprefixer

### Styling and Design
- **Tailwind CSS**: Utility-first CSS framework
- **clsx**: Utility for constructing className strings
- **tailwind-merge**: Utility for merging Tailwind CSS classes

### Date and Utility Libraries
- **date-fns**: Modern date utility library
- **nanoid**: URL-safe unique string ID generator
- **ws**: WebSocket library for Neon database connections