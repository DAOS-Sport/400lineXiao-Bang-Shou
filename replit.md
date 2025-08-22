# LINE 小秘書系統

## Overview

This is a comprehensive LINE bot system called "駿斯小助理" designed as a group task management assistant with specialized monitoring capabilities. The system integrates with LINE's official account API to provide automated task creation, AI-powered task extraction using GPT-4o-mini, **reply-triggered scheduled responses**, comprehensive message backup functionality, dedicated water quality monitoring for swimming pool facilities, and wind forecast services. The architecture follows a headless API approach with strict group isolation and **cost-free notification strategy** through reply triggers.

The system automatically detects tasks when messages contain specific keywords (交辦), uses "駿斯小助理" (trigger: 小助理請紀錄) to extract actionable items from conversations with group authorization, and provides **reply-triggered task summaries** at 06:30, 11:00, 15:00, and 20:00 Asia/Taipei time slots. It includes admin controls, user identification features, authorized group management for GPT functionality, a robust message backup system that preserves all LINE conversations permanently with automatic daily backups at 02:00, specialized water quality monitoring for group C50c2a9623a78cc5f5e9f39557e3abfe6 with **reply-triggered reports** at 13:00, 17:30, and 20:30, and wind forecast services for group C360be1fe6ea876a4df3ca0497bca4e3b at **reply-triggered forecasts** at 06:00, 12:00, and 21:30.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (2025-08-22)

### 🔧 修復回覆觸發重複發送問題
- ✅ **解決重複觸發**：修復回覆觸發機制重複發送同一時段通知的問題
- ✅ **智能去重檢查**：檢查已發送記錄，確保每個時段只觸發一次
- ✅ **群組隔離保持**：每個群組的發送狀態獨立追蹤，避免交叉影響
- ✅ **完整日誌追蹤**：詳細記錄待觸發、已發送、清除狀態的完整流程
- ✅ **三服務統一**：任務提醒、水質報告、風力預報都使用相同的去重邏輯

### 🎯 完全轉換為免費回覆觸發策略
- ✅ **重大架構變更**：將所有推播改為回覆觸發模式，完全消除 LINE API 費用
- ✅ **排程標記機制**：排程器僅標記時間點，等待用戶互動觸發回覆
- ✅ **智能觸發檢測**：任何群組訊息後自動檢查並觸發對應時段的內容
- ✅ **一次性回覆**：每個時段只回覆一次，防止重複發送
- ✅ **群組隔離保持**：不同群組的觸發互不影響，確保內容準確性
- ✅ **三大服務整合**：任務提醒、水質報告、風力預報全面支援回覆觸發
- ✅ **增強用戶體驗**：保持原有功能，改為更自然的互動式觸發

### 任務完成系統修復（前版本）
- ✅ 修復任務完成當機問題：解決TypeScript編譯錯誤防止系統崩潰
- ✅ 改善重複完成任務處理：當用戶嘗試完成已完成任務時，顯示友善提醒而非錯誤訊息
- ✅ 增強群組隔離檢測：添加詳細DEBUG日誌追蹤群組ID使用情況
- ✅ 驗證系統架構：確認webhook處理邏輯正確使用來源群組ID進行回覆
- ✅ 調整推播時間：移除08:00推播，改為每日4次 (06:30, 11:00, 15:00, 20:00)
- ✅ 增強任務提醒格式：添加完成指引「交辦XX完成」和GPT每日勵志語
- ✅ 建立後台管理介面：/admin 路徑提供即時資料庫查看功能

### 群組隔離問題分析
**現象**：不同群組的任務完成回覆都出現在同一個群組中
**根本原因分析**：系統代碼邏輯完全正確，問題可能在LINE Bot配置層面：
1. LINE Bot的Channel Access Token可能有群組訪問限制
2. Webhook路由可能有重定向或過濾設定  
3. LINE Developer Console中的Bot權限設定問題

**解決方案**：
- 代碼層面：已添加詳細DEBUG日誌追蹤群組ID使用
- 配置層面：需檢查LINE Developer Console中的Bot設定和權限
- 測試確認：系統中13個群組都有正確的任務隔離機制，pushMessage使用正確群組ID

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
  - Four daily task reminder time markers (06:30, 11:00, 15:00, 20:00)
  - Daily message backup at 02:00 (unchanged)
  - Daily water quality report time markers at 13:00, 17:30, and 20:30
  - Daily wind forecast time markers at 06:00, 12:00, and 21:30
- **Reply Trigger System**: **Cost-free notification strategy** replacing push messaging:
  - Schedulers mark time slots as "awaiting_trigger" in audit logs
  - Any group message after scheduled time triggers automatic reply
  - One-time reply per time slot prevents spam
  - Maintains original functionality with zero LINE API costs
  - Supports all notification types: task reminders, water quality reports, wind forecasts
- **Group Isolation**: Strict per-group task processing with no cross-group data sharing
- **Task Summarization**: AI-powered daily task summary with GPT-generated processing suggestions
- **Time Range Logic**: Each group receives tasks created from yesterday 00:00 to current time specific to that group (昨天+今天發送前的所有事項)
- **Backup Automation**: Automatic daily backup of all LINE conversations with permanent retention
- **Water Quality Monitoring**: Specialized monitoring for multiple swimming pool facilities:
  - Single pool monitoring with temperature data
  - Multi-pool monitoring with additional equipment tracking (加藥量, 鍋爐狀態)
- **Wind Forecast Service**: Dedicated wind and weather prediction for golf driving range (24.77662974487106, 121.01465928420598):
  - Three daily reports at 06:00, 12:00, and 21:30
  - Current wind conditions from C0D660 新竹東區工研院氣象站 (3.71km away)
  - 6-hour weather forecast with rain probability and sunshine conditions (40 characters max)
  - Golf course operation recommendations and safety alerts
  - Exclusive to group C360be1fe6ea876a4df3ca0497bca4e3b

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
- **Dual Recognition System**: 
  - Traditional RegEx-based parsing for Taiwanese date format (民國年) and water quality parameters
  - **🤖 GPT Intelligent Analysis** - AI-powered conversation analysis to identify water quality records regardless of format variations
- **Memory Caching**: In-memory storage for daily water quality data with automatic cleanup
- **Data Validation**: Comprehensive validation for chlorine levels, pH values, and temperature readings
- **Report Generation**: 
  - Automated daily summaries with status evaluation and trend analysis
  - **🤖 AI-Generated Analysis Reports** - GPT-powered professional water quality assessments with improvement recommendations
  - **🌤️ NEW: Real Weather Integration** - Central Weather Administration API integration for Hsinchu Science Park weather forecasts
- **Smart Scheduling**: Daily 21:00 GPT analysis to catch any missed records from irregular conversation formats
- **Weather-Based Recommendations**: 
  - Real-time weather data affects water quality management suggestions
  - UV index considerations for chlorine management
  - Temperature and rainfall impact on water treatment protocols

### Development Tools
- **ESBuild**: Fast bundling for production server builds
- **PostCSS**: CSS processing with autoprefixer
- **Replit Integration**: Development environment optimization with runtime error handling