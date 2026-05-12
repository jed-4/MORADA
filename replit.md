# BuildPro
BuildPro is a project management software for Australian residential builders, streamlining workflows, enhancing collaboration, and providing robust financial oversight.

## Run & Operate
- **Run Dev Server**: `npm run dev`
- **Build Frontend**: `npm run build:client`
- **Build Backend**: `npm run build:server`
- **Typecheck**: `npm run typecheck`
- **DB Migrations**: `drizzle-kit push:pg` (additive migrations only, never destructive in deploy build)
- **Environment Variables**: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `RESEND_API_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_ENDPOINT`

## Stack
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack Query, Radix UI, shadcn/ui, Tailwind CSS
- **Backend**: Express.js, TypeScript
- **ORM**: Drizzle ORM (PostgreSQL dialect)
- **Database**: PostgreSQL (Neon serverless)
- **Validation**: React Hook Form
- **Build Tool**: Vite (frontend), esbuild (backend)

## Where things live
- **Client-side code**: `/client`
- **Server-side code**: `/server`
- **Shared code**: `/shared`
- **Mobile app**: `/expo-mobile`
- **DB Schema**: `server/db/schema.ts`
- **Frontend Entry**: `client/src/main.tsx`
- **Backend Entry**: `server/index.ts`
- **Custom Design System/Styling**: `client/tailwind.config.cjs`, `client/src/index.css`
- **Core UI Libraries**: `client/src/components`
- **Utility Formatters**: `client/src/lib/formatters.ts`
- **Shared DataTable**: `client/src/components/data-table/DataTable.tsx`
- **Notion-like Editor**: `client/src/components/NotionEditor.tsx`

## Architecture decisions
- **Monorepo Structure**: Client, server, and shared code are co-located for simplified development and dependency management.
- **Custom Authentication with OAuth**: Implemented a standalone email/password system alongside optional Google OAuth for flexibility, with secure session management.
- **Serverless-first Data Layer**: Utilizes Neon for PostgreSQL with Drizzle ORM and connection pooling, optimizing for scalability and cost efficiency.
- **Unified UI Component Strategy**: Leverages Radix UI primitives with shadcn/ui and Tailwind CSS for a consistent, accessible, and themeable interface across the web application.
- **Mobile-first Backend Design**: The Express API is designed to serve both web and mobile clients (Expo/React Native), using session-based authentication compatible with both platforms.
- **Attachment Storage Strategy**: Files are uploaded to object storage *before* AI processing, ensuring data persistence even if AI extraction fails.

## Product
- **Project Management**: Customizable dashboards, comprehensive task management (Kanban, List, Calendar views), schedule management with Gantt charts, site diaries, checklist system.
- **Financial Management**: Budget tracking, client invoices, purchase orders, allowances system, Xero integration, CFO dashboard for overheads.
- **Collaboration & Communication**: Scheduled messaging, file attachments in messages, internal documentation system, notes & memos.
- **AI-Powered Features**: AI Bill Reader for automated invoice/bill data extraction.
- **User & Business Customization**: Roles & permissions, user view preferences, company-isolated settings, E-Notes template system.
- **Mobile Access**: Dedicated Expo/React Native app for on-the-go access to key features like tasks, site diaries, and notes.

## User preferences
Preferred communication style: Simple, everyday language.

## Production database setup (task #225 investigation findings)
BuildPro's database setup uses `DATABASE_URL` exclusively. Here is what each environment actually connects to:

- **Development workspace** (`host=helium db=heliumdb`): Replit's internal PostgreSQL connection pooler. This is a proxy managed by Replit's `javascript_database` integration.
- **Production deployment** (`host=ep-delicate-flower-aeoexpyq.c-2.us-east-2.aws.neon.tech db=neondb`): A Replit-managed Neon PostgreSQL database. This endpoint is **stable** — every republish uses the same Neon endpoint and the production data is never wiped by a deployment.
- **`NEON_DATABASE_URL`** (secret) — points to a **separate, older Neon database** (`ep-muddy-sunset-aelsjwoz...`) with a stale schema. Do NOT use this. Switching to it breaks the app because it is missing many columns added in later migrations.
- **Startup log**: every boot prints `[DB] connected — host=... db=... env=...` so you can confirm which database is active. Production should always show `ep-delicate-flower-aeoexpyq...`; if it ever shows a different host after a republish, that is the data-loss trigger.
- **No destructive startup code**: all startup hooks (`seedMissingBuiltInCategories`, `healContactNames`, `repairDuplicateScopeStages`) are idempotent upserts. No `DROP`/`TRUNCATE`/`DELETE` runs on boot. The deploy build (`npm run build`) does not run `drizzle-kit push`.

## Gotchas
- **Production Database**: The production deployment consistently uses `ep-delicate-flower-aeoexpyq.c-2.us-east-2.aws.neon.tech` as its Neon endpoint. Republishing does not change this. If data appears lost after a republish, check the `[DB] connected` log in deployment logs first — a host change is the only code-level cause of data loss.
- **Destructive DB Operations**: Never introduce destructive database queries (`DELETE`, `TRUNCATE`, `DROP`) or `drizzle-kit` commands into the deploy build. Only additive migrations are allowed in production.
- **DataTable Storage**: When multiple `DataTable` instances on a page should share column state, ensure they use the same `storageKey`.
- **LineItemTable Inputs**: For cells with embedded inputs/selects in `LineItemTable`, set `truncate: false` to prevent input collapse.

## Pointers
- **shadcn/ui Documentation**: [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **TanStack Query Documentation**: [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
- **Tailwind CSS Documentation**: [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Vite Documentation**: [https://vitejs.dev/guide/](https://vitejs.dev/guide/)
- **React Native Documentation**: [https://reactnative.dev/docs/getting-started](https://reactnative.dev/docs/getting-started)
- **Expo Documentation**: [https://docs.expo.dev/](https://docs.expo.dev/)
- **NotionEditor Component**: `client/src/components/NotionEditor.tsx`