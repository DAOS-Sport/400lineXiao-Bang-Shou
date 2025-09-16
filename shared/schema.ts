import { pgTable, varchar, text, timestamp, jsonb, serial, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Messages Table - 訊息原始存證
export const messages = pgTable('messages', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`), // 匹配現有資料庫結構
  messageId: text('message_id').notNull().unique(), // LINE 事件 ID
  sourceType: text('source_type').notNull(), // 'user' | 'group' | 'room'
  groupId: text('group_id'), // 群組 ID（如有）
  roomId: text('room_id'), // Room ID（如有）
  userId: text('user_id').notNull(), // 發話者 ID
  displayName: text('display_name'), // 顯示名稱（可選）
  type: text('type').notNull(), // text | image | file ...
  text: text('text'), // 文字內容
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(), // ISO 時間戳，存台北時區
  rawEvent: jsonb('raw_event').notNull(), // 原始 JSON 事件
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  // 移除 updatedAt，匹配現有資料庫結構
}, (table) => ({
  timestampIdx: index('messages_timestamp_idx').on(table.timestamp.desc()),
  groupIdIdx: index('messages_group_id_idx').on(table.groupId),
  userIdIdx: index('messages_user_id_idx').on(table.userId),
  sourceTypeIdx: index('messages_source_type_idx').on(table.sourceType),
  messageIdIdx: uniqueIndex('messages_message_id_idx').on(table.messageId)
}));

// Tasks Table - 任務管理
export const tasks = pgTable('tasks', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`), // 匹配現有資料庫結構
  groupId: text('group_id').notNull(), // 任務來源群組
  taskIdSerial: text('task_id_serial').notNull(), // 匹配現有欄位名
  text: text('text').notNull(), // 匹配現有欄位名
  status: text('status').notNull().default('open'), // 匹配現有預設值 'open'
  authorUserId: text('author_user_id').notNull(), // 匹配現有欄位名
  authorDisplayName: text('author_display_name'), // 匹配現有欄位名
  completedAt: timestamp('completed_at', { withTimezone: true }), // 完成時間（如有）
  sourceMessageIds: jsonb('source_message_ids').default(sql`'[]'::jsonb`), // 匹配現有預設值
  assigneeUserId: text('assignee_user_id'), // 匹配現有欄位名
  dueDate: timestamp('due_date', { withTimezone: true }), // 匹配現有欄位名
  place: text('place'), // 匹配現有欄位名
  counterparty: text('counterparty'), // 匹配現有欄位名
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  groupSerialIdx: uniqueIndex('tasks_group_serial_idx').on(table.groupId, table.taskIdSerial),
  groupStatusIdx: index('tasks_group_status_idx').on(table.groupId, table.status),
  createdAtIdx: index('tasks_created_at_idx').on(table.createdAt.desc())
}));

// Admins Table - 白名單 / 權限控管  
export const admins = pgTable('admins', {
  userId: text('user_id').primaryKey(), // 主鍵匹配現有結構
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull() // 只有這個欄位存在
}, (table) => ({}));

// Authorized Groups Table - GPT功能授權群組
export const authorizedGroups = pgTable('authorized_groups', {
  groupId: varchar('group_id').primaryKey(), // LINE群組ID
  groupName: varchar('group_name'), // 群組名稱（可選）
  description: text('description'), // 授權說明
  isActive: varchar('is_active').default('true').notNull(), // 'true' | 'false'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  isActiveIdx: index('authorized_groups_is_active_idx').on(table.isActive),
  createdAtIdx: index('authorized_groups_created_at_idx').on(table.createdAt.desc())
}));

// Audit Logs Table - 稽核日誌
export const auditLogs = pgTable('audit_logs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`), // 匹配現有資料庫結構
  level: text('level').notNull(), // 'info' | 'warning' | 'error'
  category: text('category').notNull(), // 'webhook' | 'llm' | 'scheduler' | 'auth'
  message: text('message').notNull(),
  details: jsonb('details'), // 額外詳細資料
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull() // 匹配現有欄位名稱
}, (table) => ({
  timestampIdx: index('audit_logs_timestamp_idx').on(table.timestamp.desc()),
  categoryIdx: index('audit_logs_category_idx').on(table.category),
  levelIdx: index('audit_logs_level_idx').on(table.level)
}));

// Message Backups Table - 消息備份歷史（永久保存）
export const messageBackups = pgTable('message_backups', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  backupDate: varchar('backup_date').notNull(), // 格式: YYYY-MM-DD
  backupType: varchar('backup_type').notNull(), // 'daily' | 'weekly' | 'monthly' | 'manual'
  totalMessages: varchar('total_messages').notNull(), // 備份消息總數
  groupId: varchar('group_id'), // 群組ID（可選，用於分群組備份）
  filePath: text('file_path'), // 備份檔案路徑（如果導出為檔案）
  backupData: jsonb('backup_data').notNull(), // 完整備份資料
  createdAt: timestamp('created_at').defaultNow().notNull(),
  metadata: jsonb('metadata') // 備份詳細資訊
}, (table) => ({
  backupDateIdx: index('message_backups_backup_date_idx').on(table.backupDate.desc()),
  backupTypeIdx: index('message_backups_backup_type_idx').on(table.backupType),
  groupIdIdx: index('message_backups_group_id_idx').on(table.groupId),
  createdAtIdx: index('message_backups_created_at_idx').on(table.createdAt.desc())
}));

// System Settings Table - 系統設定（備份週期等）
export const systemSettings = pgTable('system_settings', {
  key: varchar('key').primaryKey(), // 設定鍵值
  value: text('value').notNull(), // 設定值
  description: text('description'), // 設定說明
  category: varchar('category').notNull().default('general'), // 'backup' | 'notification' | 'general'
  isActive: varchar('is_active').notNull().default('true'), // 'true' | 'false'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  categoryIdx: index('system_settings_category_idx').on(table.category),
  isActiveIdx: index('system_settings_is_active_idx').on(table.isActive)
}));

// Employee Cache Table - 員工快取（加速 ID 查詢）
export const employeeCache = pgTable('employee_cache', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`), // 主鍵
  lineId: text('line_id').notNull().unique(), // LINE ID，唯一鍵
  employeeId: text('employee_id').notNull(), // 員工編號
  employeeName: text('employee_name'), // 員工姓名（用於除錯和管理）
  department: text('department'), // 部門資訊
  cachedAt: timestamp('cached_at', { withTimezone: true }).defaultNow().notNull(), // 快取建立時間
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // 快取過期時間
  lastAccessed: timestamp('last_accessed', { withTimezone: true }), // 最後存取時間
  accessCount: varchar('access_count').default('0').notNull() // 存取次數
}, (table) => ({
  lineIdIdx: uniqueIndex('employee_cache_line_id_idx').on(table.lineId),
  expiresAtIdx: index('employee_cache_expires_at_idx').on(table.expiresAt),
  cachedAtIdx: index('employee_cache_cached_at_idx').on(table.cachedAt.desc()),
  lastAccessedIdx: index('employee_cache_last_accessed_idx').on(table.lastAccessed.desc())
}));

// Relations
export const messagesRelations = relations(messages, ({ many }) => ({
  // 可以在這裡定義關聯，例如與任務的關聯
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  // 可以在這裡定義關聯，例如與訊息的關聯
}));

// Drizzle Insert Schemas for Zod validation
export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true
});

export const insertAdminSchema = createInsertSchema(admins).omit({
  createdAt: true
});

export const insertAuthorizedGroupSchema = createInsertSchema(authorizedGroups).omit({
  createdAt: true,
  updatedAt: true
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  timestamp: true
});

export const insertMessageBackupSchema = createInsertSchema(messageBackups).omit({
  id: true,
  createdAt: true
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  createdAt: true,
  updatedAt: true
});

// TypeScript Types
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type MessageBackup = typeof messageBackups.$inferSelect;
export type InsertMessageBackup = z.infer<typeof insertMessageBackupSchema>;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;

export type AuthorizedGroup = typeof authorizedGroups.$inferSelect;
export type InsertAuthorizedGroup = z.infer<typeof insertAuthorizedGroupSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Interface compatibility for existing code
export interface IMessage {
  id: string; // 匹配 varchar
  messageId: string;
  sourceType: string;
  groupId?: string | null;
  roomId?: string | null;
  userId: string;
  displayName?: string | null;
  type: string;
  text?: string | null;
  timestamp: Date;
  rawEvent: any;
  createdAt: Date;
}

export interface ITask {
  id: string; // 匹配 varchar
  groupId: string;
  taskIdSerial: string; // 匹配現有欄位名
  authorUserId: string; // 匹配現有欄位名
  authorDisplayName?: string | null; // 匹配現有欄位名
  text: string; // 匹配現有欄位名
  status: string;
  completedAt?: Date | null;
  sourceMessageIds: any; // 匹配現有欄位名
  createdAt: Date;
}

export interface IAdmin {
  userId: string; // 主鍵
  createdAt: Date;
}

export interface IAuditLog {
  id: string; // 匹配 varchar
  level: string;
  category: string;
  message: string;
  details?: any;
  timestamp: Date; // 匹配現有欄位名
}

// Create Data interfaces for compatibility
export interface CreateMessageData {
  id: string; // 需要提供ID
  messageId: string;
  sourceType: string;
  groupId?: string;
  roomId?: string;
  userId: string;
  displayName?: string;
  type: string;
  text?: string;
  timestamp: Date;
  rawEvent: any;
}

export interface CreateTaskData {
  id: string; // 需要提供ID  
  groupId: string;
  taskIdSerial: string; // 匹配欄位名
  authorUserId: string; // 匹配欄位名
  authorDisplayName?: string; // 匹配欄位名
  text: string; // 匹配欄位名
  status?: string;
  sourceMessageIds?: any; // 匹配欄位名
}

export interface CreateAdminData {
  userId: string;
}

export interface CreateAuditLogData {
  id: string; // 需要提供ID
  level: string;
  category: string;
  message: string;
  details?: any;
}

// Employee Cache interfaces
export interface IEmployeeCache {
  id: string;
  lineId: string;
  employeeId: string;
  employeeName?: string;
  department?: string;
  cachedAt: Date;
  expiresAt: Date;
  lastAccessed?: Date;
  accessCount: string;
}

export interface CreateEmployeeCacheData {
  id: string;
  lineId: string;
  employeeId: string;
  employeeName?: string;
  department?: string;
  expiresAt: Date;
}