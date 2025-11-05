# Overview

TempMail Pro is a temporary email service application that allows users to generate disposable email addresses, receive messages, and validate links within those messages. The application provides automated link validation using both Firebase link detection and Playwright browser automation. Built with React (Vite) on the frontend and Express.js on the backend, it uses an in-memory storage system for link validation tracking and integrates with an external email service API.

The project features a clean architecture with:
- **Frontend**: React application in `client/` directory
- **Backend**: Express.js server in `server/` directory with organized services
- **Telegram Bot**: Dedicated bot module in `server/bot/` for Telegram integration
- **Shared Types**: Common TypeScript schemas in `shared/` directory

# User Preferences

Preferred communication style: Simple, everyday language.

# Project Structure

```
├── client/               # Frontend React application
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom React hooks
│   │   ├── i18n/         # Internationalization
│   │   ├── lib/          # Utilities and API client
│   │   ├── pages/        # Application pages
│   │   ├── App.tsx       # Main app component
│   │   └── main.tsx      # Entry point
│   └── index.html
│
├── server/               # Backend Express application
│   ├── bot/              # Telegram bot (isolated module)
│   │   ├── telegram.ts   # Bot implementation
│   │   └── index.ts      # Bot exports
│   ├── lib/              # Backend utilities
│   ├── services/         # Business logic services
│   │   ├── emailService.ts
│   │   ├── linkValidationService.ts
│   │   ├── playwrightService.ts
│   │   ├── accountAutomationService.ts
│   │   ├── cacheService.ts
│   │   ├── sqlService.ts
│   │   └── supabaseStorage.ts
│   ├── index.ts          # Server entry point
│   ├── routes.ts         # API routes
│   └── vite.ts           # Vite middleware setup
│
├── shared/               # Shared TypeScript types
│   ├── schema.ts         # Zod schemas and types
│   └── email-providers.ts
│
├── attached_assets/      # Static assets
└── vite.config.ts        # Vite configuration
```

# System Architecture

## Frontend Architecture

**Framework & Tooling**
- **React with Vite**: Modern frontend build tool for fast development and optimized production builds
- **TypeScript**: Full type safety across the application with strict mode enabled
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management with aggressive caching strategies

**UI Component System**
- **shadcn/ui**: Component library built on Radix UI primitives with Tailwind CSS styling
- **Design System**: "New York" style variant with neutral color scheme and CSS variables for theming
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints

**Key Design Decisions**
- Chose TanStack Query over Redux/Context for server state to reduce boilerplate and provide built-in caching, polling, and error handling
- Selected Wouter over React Router for minimal bundle size impact
- Implemented polling mechanism for real-time message updates with configurable intervals
- Separated UI components from business logic using custom hooks pattern

## Backend Architecture

**Server Framework**
- **Express.js**: RESTful API server with JSON middleware
- **TypeScript with ESM**: Modern module system for better tree-shaking and compatibility
- **Development Setup**: Vite middleware integration for HMR in development

**API Structure**
- RESTful endpoints for email operations (`/api/email/:email`, `/api/inbox/:inboxId`)
- Validation endpoints for link checking (`/api/validate/:inboxId`)
- Status endpoint for system monitoring (`/api/status`)

**Service Layer Pattern**
- **EmailService**: Handles communication with external email API (email.devtai.net), link extraction from HTML/text content
- **LinkValidationService**: Orchestrates validation logic, delegates to Firebase or Playwright based on link type
- **PlaywrightService**: Manages browser automation with connection pooling (max 2 concurrent browsers) for efficient resource usage

**Telegram Bot Module**
- **Location**: `server/bot/` - Isolated from other services for better organization
- **Configuration**: Requires `TELEGRAM_BOT_TOKEN` environment variable (obtainable from [@BotFather](https://t.me/botfather) on Telegram)
- **Features**: User authentication, email management, inbox viewing, auto-validation of links, multi-language support (FR/EN)
- **Implementation**: Uses Telegraf library with session management, commands, and callbacks
- **Integration**: Directly imports and uses backend services (EmailService, AccountAutomationService, Storage)
- **Auto-refresh**: Polls for new messages every 5 seconds and automatically notifies users
- **Graceful degradation**: Bot automatically disables itself if no token is provided, allowing the rest of the application to run normally

**Key Design Decisions**
- Separated business logic into services for testability and maintainability
- Implemented browser connection pooling to balance performance and resource constraints
- Used dependency injection pattern for storage layer to enable future database migration
- Raw body parsing for potential webhook integrations
- Isolated Telegram bot in dedicated module (`server/bot/`) for cleaner architecture and easier maintenance

## Data Storage

**Supabase PostgreSQL Database**
- **SupabaseStorage Class**: Production-ready storage using Supabase PostgreSQL
- **Tables**: users, api_tokens, link_validations, email_history
- **Data Models**: Defined using Zod schemas for runtime validation
- **Type Safety**: Shared schema types between frontend and backend

**Key Design Decisions**
- Using Supabase for authentication, database, and real-time features
- Schema-first approach with Zod ensures consistent validation across application layers
- Shared types between client and server prevent type mismatches
- Row Level Security (RLS) enabled for secure data access

## External Dependencies

**Third-Party Email Service**
- **Provider**: email.devtai.net API
- **Integration**: Axios-based HTTP client for fetching messages, message details, and deletion
- **Endpoints Used**:
  - `GET /api/email/:email` - Retrieve messages for an email address
  - `GET /api/inbox/:inboxId` - Get specific message details
  - `GET /api/delete/:inboxId` - Delete a message

**Browser Automation**
- **Playwright**: Headless Chromium for link validation
- **Configuration**: Sandboxed mode with custom viewport and user agent
- **Resource Management**: Pre-initialized browser contexts with connection pooling

**Database (Active)**
- **Supabase PostgreSQL**: Serverless PostgreSQL with built-in authentication
- **Connection**: Environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`
- **Client Library**: @supabase/supabase-js for database operations

**UI Component Libraries**
- **Radix UI**: Unstyled, accessible component primitives (dialogs, dropdowns, tooltips, etc.)
- **Tailwind CSS**: Utility-first CSS framework with custom theme configuration
- **Lucide React**: Icon library for consistent iconography

**Development Tools**
- **Replit Plugins**: Cartographer and dev banner for Replit-specific development features
- **TSX**: TypeScript execution for development server
- **ESBuild**: Fast bundling for production builds

**Key Design Decisions**
- External email service allows focus on UI/UX without managing email infrastructure
- Playwright chosen over Puppeteer for better debugging and multi-browser support
- Supabase selected for PostgreSQL, authentication, and real-time features with minimal setup
- Radix UI provides accessibility compliance out of the box while allowing custom styling