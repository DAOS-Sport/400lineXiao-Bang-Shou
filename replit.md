# LINE 小秘書系統

## Overview
This LINE bot system, "駿斯小助理," acts as a group task management assistant with specialized monitoring features. It integrates with LINE's official API to offer automated task creation, AI-driven task extraction using GPT-4o-mini, reply-triggered scheduled responses for notifications, comprehensive message backup, dedicated water quality monitoring for swimming pools, and wind forecast services. The system employs a headless API architecture, ensuring strict group isolation and a cost-free notification strategy via reply triggers. It automatically identifies tasks from messages containing specific keywords, provides reply-triggered task summaries at defined intervals, includes admin controls, user identification, authorized group management for GPT functions, and permanent message backup. It also offers specialized water quality reports and wind forecasts, both delivered through reply-triggered mechanisms.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful headless API with endpoints for LINE webhook processing, health monitoring, and administrative message viewing.
- **Security**: Uses Helmet for security headers, express-rate-limit, and LINE webhook signature validation.

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe operations and connection pooling.
- **Schema Design**: Tables for messages, tasks (group-isolated, serial numbering), admins, authorized groups (for GPT), audit logs, message backups, and system settings. Water quality records are stored via audit logs.
- **Memory Storage**: In-memory caching for water quality data.
- **Indexing**: Strategic indexes on frequently queried fields.
- **Backup Strategy**: Permanent message retention with automated daily backups.

### Message Processing
- **Event Handling**: Asynchronous processing of LINE webhook events.
- **Task Detection**: Automatic task creation based on keywords ("交辦").
- **Water Quality Detection**: Automatic recognition of water quality data in various formats for different groups.
- **Multi-Group Processing**: Supports water quality monitoring for multiple groups with distinct facility types.
- **Storage Strategy**: Raw event preservation in JSONB format.
- **Push Notification**: Direct group push using LINE API's `pushMessage` with rate limiting and retry.

### AI Integration
- **LLM Service**: OpenAI GPT-4o-mini for natural language task extraction and processing suggestions.
- **Context Analysis**: Reviews recent messages for task identification.
- **JSON Output**: Structured task extraction with error handling.
- **Task Suggestions**: GPT-generated concise processing suggestions.

### Scheduling System
- **Cron Jobs**: `node-cron` for scheduling daily task reminders, message backups, water quality reports, and wind forecasts in Asia/Taipei timezone.
- **Reply Trigger System**: A cost-free notification strategy where schedulers mark time slots, and any group message after the scheduled time triggers an automatic, one-time reply. This applies to all notification types.
- **Group Isolation**: Strict per-group task processing.
- **Task Summarization**: AI-powered daily task summaries.
- **Time Range Logic**: Tasks within the past month specific to a group are summarized.
- **Backup Automation**: Automatic daily backup of LINE conversations.
- **Water Quality Monitoring**: Specialized monitoring for multiple swimming pool facilities, including temperature and equipment tracking.
- **Wind Forecast Service**: Dedicated wind and weather prediction for a specific golf driving range, with daily reports and golf course recommendations.

### Authentication & Authorization
- **Multi-layer Security**: Supports Basic Auth and Bearer Token.
- **Admin Controls**: Environment-variable defined admin user IDs.
- **Group Targeting**: Environment-configurable target group IDs.

### Frontend Architecture
- **Client Framework**: React with TypeScript and Vite.
- **UI Components**: shadcn/ui with Radix UI.
- **State Management**: TanStack Query.
- **Styling**: Tailwind CSS.
- **Routing**: Wouter for client-side routing.

### Development & Build System
- **Build Tool**: Vite for fast development and optimized builds.
- **TypeScript**: Strict type checking.
- **Module Resolution**: Path aliases.
- **Hot Reload**: Development server with HMR.

## External Dependencies

### LINE Platform Integration
- **LINE Bot SDK**: `@line/bot-sdk` for message handling, user profiles, and group management.
- **Webhook Processing**: Real-time event processing with signature validation.
- **Message API**: Supports text, replies, and push notifications.

### AI Services
- **OpenAI API**: GPT-4o-mini for task extraction and conversation analysis.
- **Prompt Engineering**: Structured prompts for consistent output.

### Database Services
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe database operations.

### Scheduling & Time Management
- **node-cron**: Timezone-aware task scheduling.
- **dayjs**: Date manipulation with timezone support.

### Security & Monitoring
- **Crypto Module**: HMAC signature validation.
- **Helmet**: Security headers.
- **Rate Limiting**: Express rate limiting.
- **Audit Logging**: System activity tracking.

### Water Quality Monitoring
- **Dual Recognition System**: RegEx-based parsing and GPT Intelligent Analysis for water quality data.
- **Memory Caching**: In-memory storage for daily data.
- **Data Validation**: Comprehensive validation for parameters.
- **Report Generation**: Automated daily summaries, AI-Generated Analysis Reports, and Real Weather Integration (Central Weather Administration API) for Hsinchu Science Park.
- **Smart Scheduling**: Daily GPT analysis for missed records.
- **Weather-Based Recommendations**: Recommendations influenced by real-time weather, UV index, temperature, and rainfall.

### Development Tools
- **ESBuild**: Fast bundling.
- **PostCSS**: CSS processing.
- **Replit Integration**: Development environment optimization.