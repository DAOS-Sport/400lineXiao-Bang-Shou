# LINE 小秘書系統

## Overview

This is a comprehensive LINE bot system called "駿斯小助理" designed as a group task management assistant with specialized water quality monitoring capabilities. The system integrates with LINE's official account API to provide automated task creation, AI-powered task extraction using GPT-4o-mini, scheduled daily reminders, comprehensive message backup functionality, and dedicated water quality monitoring for swimming pool facilities. The architecture follows a headless API approach with strict group isolation to ensure data security and proper boundary management.

The system automatically detects tasks when messages contain specific keywords (交辦), uses "駿斯小助理" (trigger: 小助理請紀錄) to extract actionable items from conversations with group authorization, and provides daily task summaries at 06:30, 08:00, 11:00, 15:00, and 20:00 Asia/Taipei time. It includes admin controls, user identification features, authorized group management for GPT functionality, a robust message backup system that preserves all LINE conversations permanently with automatic daily backups at 02:00, and specialized water quality monitoring for group C50c2a9623a78cc5f5e9f39557e3abfe6 with daily reports at 22:00.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js with TypeScript for type safety and modern development practices
- **API Design**: RESTful headless API with three main endpoints:
  - `POST /webhook` for LINE message processing with signature validation
  - `GET /healthz` for health monitoring
  - `GET /api/admin/messages` for administrative message viewing
- **Security**: Implements helmet for security headers, express-rate-limit for rate limiting, and comprehensive signature validation for LINE webhooks

### Database Layer
- **ORM**: Drizzle ORM for type-safe database operations with PostgreSQL
- **Connection**: Neon serverless PostgreSQL with connection pooling
- **Schema Design**: 
  - Messages table for raw event storage with JSONB fields
  - Tasks table with group-based isolation and serial numbering
  - Admins table for access control
  - Authorized groups table for GPT functionality access control
  - Audit logs for system monitoring and compliance
  - Message backups table for permanent conversation storage
  - System settings table for backup configuration
  - Water quality records stored via audit logs with specialized categorization
- **Memory Storage**: In-memory caching for water quality data with automatic cleanup
- **Indexing**: Strategic indexes on frequently queried fields (timestamp, groupId, userId, text)
- **Backup Strategy**: Permanent message retention with automated daily backups at 02:00 Asia/Taipei time

### Message Processing
- **Event Handling**: Asynchronous processing of LINE webhook events with immediate 200 response
- **Task Detection**: Automatic task creation when messages contain "交辦" keyword
- **Water Quality Detection**: Automatic recognition of water quality data in multiple formats:
  - Original format: (民國年/月/日 時.分, CL, PH, 水溫, 氣溫) for group C50c2a9623a78cc5f5e9f39557e3abfe6
  - Multi-pool format: (民國年 月.日) with multiple pool sections for group C9b3c5dfe2e005adafd2ed914714a1930
- **Multi-Group Processing**: Water quality monitoring supports two groups with different facility types:
  - C50c2a9623a78cc5f5e9f39557e3abfe6: Single pool monitoring
  - C9b3c5dfe2e005adafd2ed914714a1930: Multi-pool facility (大池&兒童池, SPA池, 熱水池, 冷水池)
- **Storage Strategy**: Raw event preservation in JSONB format for audit trails and debugging
- **Push Notification**: Direct group push using LINE API's pushMessage(groupId) with rate limiting and retry mechanism

### AI Integration
- **LLM Service**: OpenAI GPT-4o-mini for natural language task extraction and processing suggestions
- **Context Analysis**: Reviews recent 20 messages with emphasis on latest 5 for task identification
- **JSON Output**: Structured task extraction with error handling and fallback mechanisms
- **Task Suggestions**: GPT-generated concise processing suggestions (limited to 30 characters for brevity and clarity)

### Scheduling System
- **Cron Jobs**: node-cron with Asia/Taipei timezone for:
  - Five daily task reminders (06:30, 08:00, 11:00, 15:00, 20:00)
  - Daily message backup at 02:00
  - Daily water quality reports at 13:00, 17:30, and 20:30 (for authorized group)
- **Group Push**: Direct push to LINE groups using pushMessage(groupId) API
  - 300ms delay between groups to avoid rate limiting
  - Automatic retry with exponential backoff for 429/5xx errors
  - Support for TARGET_GROUP_IDS environment variable for group configuration
- **Group Isolation**: Strict per-group task processing with no cross-group data sharing
- **Task Summarization**: AI-powered daily task summary with GPT-generated processing suggestions
- **Time Range Logic**: Each group receives tasks created from yesterday 00:00 to current time specific to that group (昨天+今天發送前的所有事項)
- **Backup Automation**: Automatic daily backup of all LINE conversations with permanent retention
- **Water Quality Monitoring**: Specialized monitoring for multiple swimming pool facilities:
  - Single pool monitoring with temperature data
  - Multi-pool monitoring with additional equipment tracking (加藥量, 鍋爐狀態)

### Authentication & Authorization
- **Multi-layer Security**: Support for both Basic Auth and Bearer Token authentication
- **Admin Controls**: Environment-variable defined admin user IDs for privileged operations
- **Group Targeting**: Environment-configurable target group IDs for selective bot activation

### Frontend Architecture
- **Client Framework**: React with TypeScript and Vite for development tooling
- **UI Components**: Comprehensive shadcn/ui component library with Radix UI primitives
- **State Management**: TanStack Query for server state management and caching
- **Styling**: Tailwind CSS with custom theme configuration and CSS variables
- **Routing**: Wouter for lightweight client-side routing

### Development & Build System
- **Build Tool**: Vite for fast development and optimized production builds
- **TypeScript**: Strict type checking across client, server, and shared code
- **Module Resolution**: Path aliases for clean imports and better code organization
- **Hot Reload**: Development server with HMR for rapid iteration

## External Dependencies

### LINE Platform Integration
- **LINE Bot SDK**: Official @line/bot-sdk for message handling, user profile access, and group management
- **Webhook Processing**: Real-time event processing with signature validation
- **Message API**: Support for text messages, replies, and push notifications

### AI Services
- **OpenAI API**: GPT-4o-mini integration for intelligent task extraction and conversation analysis
- **Prompt Engineering**: Structured prompts for consistent task identification and summarization

### Database Services
- **Neon Database**: Serverless PostgreSQL with automatic scaling and connection pooling
- **Drizzle ORM**: Type-safe database operations with migration support

### Scheduling & Time Management
- **node-cron**: Timezone-aware task scheduling for daily reminders and water quality reports
- **dayjs**: Comprehensive date manipulation with timezone support for Asia/Taipei

### Security & Monitoring
- **Crypto Module**: HMAC signature validation for webhook security
- **Helmet**: Security headers and protection middleware
- **Rate Limiting**: Express rate limiting for API protection
- **Audit Logging**: Comprehensive system activity tracking

### Water Quality Monitoring
- **Pattern Recognition**: RegEx-based parsing for Taiwanese date format (民國年) and water quality parameters
- **Memory Caching**: In-memory storage for daily water quality data with automatic cleanup
- **Data Validation**: Comprehensive validation for chlorine levels, pH values, and temperature readings
- **Report Generation**: Automated daily summaries with status evaluation and trend analysis

### Development Tools
- **ESBuild**: Fast bundling for production server builds
- **PostCSS**: CSS processing with autoprefixer
- **Replit Integration**: Development environment optimization with runtime error handling