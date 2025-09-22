# Replit Configuration

## Overview

BuildPro is a comprehensive project management software designed specifically for Australian residential builders. The application provides a dashboard-centric interface for managing construction projects, tasks, schedules, and teams. It features a customizable widget-based dashboard system, comprehensive task management with Kanban boards, calendar integration, and business operations tracking. The platform is built with React and TypeScript on the frontend, Express.js on the backend, and uses PostgreSQL with Drizzle ORM for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### September 22, 2025
- **Task View Management**: Added complete view deletion functionality with hover delete buttons on custom view tabs, confirmation dialogs, and smart tab switching when active view is deleted
- **Filter Interface Redesign**: Replaced single filter panel with horizontal bar of individual dropdown buttons below the views for improved usability and visual hierarchy
- **Enhanced UX**: Added active filter badges, "Clear All" functionality, and visual separation between views and filters using Material Design principles

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for build tooling
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state and React Context for UI state
- **UI Framework**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design system optimized for construction industry workflows
- **Theme System**: Custom theme provider supporting light/dark modes with Material Design principles

### Component Design System
- **Design Approach**: Material Design optimized for productivity and information-dense applications
- **Color Palette**: Professional construction industry aesthetic with dark/light mode support
- **Layout System**: Tailwind spacing units (2, 4, 6, 8, 12, 16) for consistent spacing
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