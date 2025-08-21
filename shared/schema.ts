import { pgTable, varchar, text, timestamp, jsonb, serial, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Messages Table - 訊息原始存證
export const messages = pgTable('messages', {
  id: varchar('id').primaryKey(), // 匹配現有資料庫結構
  messageId: varchar('message_id').notNull().unique(), // LINE 事件 ID
  sourceType: varchar('source_type').notNull(), // 'user' | 'group' | 'room'
  groupId: varchar('group_id'), // 群組 ID（如有）
  roomId: varchar('room_id'), // Room ID（如有）
  userId: varchar('user_id').notNull(), // 發話者 ID
  displayName: varchar('display_name'), // 顯示名稱（可選）
  type: varchar('type').notNull(), // text | image | file ...
  text: text('text'), // 文字內容
  timestamp: timestamp('timestamp').notNull(), // ISO 時間戳，存台北時區
  rawEvent: jsonb('raw_event').notNull(), // 原始 JSON 事件
  createdAt: timestamp('created_at').defaultNow().notNull()
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
  id: varchar('id').primaryKey(), // 匹配現有資料庫結構
  groupId: varchar('group_id').notNull(), // 任務來源群組
  taskIdSerial: varchar('task_id_serial').notNull(), // 匹配現有欄位名
  text: text('text').notNull(), // 匹配現有欄位名
  status: varchar('status').notNull().default('pending'), // 'pending' | 'completed'
  authorUserId: varchar('author_user_id').notNull(), // 匹配現有欄位名
  authorDisplayName: varchar('author_display_name'), // 匹配現有欄位名
  completedAt: timestamp('completed_at'), // 完成時間（如有）
  sourceMessageIds: jsonb('source_message_ids'), // 匹配現有欄位名
  assigneeUserId: varchar('assignee_user_id'), // 匹配現有欄位名
  dueDate: timestamp('due_date'), // 匹配現有欄位名
  place: varchar('place'), // 匹配現有欄位名
  counterparty: varchar('counterparty'), // 匹配現有欄位名
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  groupSerialIdx: uniqueIndex('tasks_group_serial_idx').on(table.groupId, table.taskIdSerial),
  groupStatusIdx: index('tasks_group_status_idx').on(table.groupId, table.status),
  createdAtIdx: index('tasks_created_at_idx').on(table.createdAt.desc())
}));

// Admins Table - 白名單 / 權限控管  
export const admins = pgTable('admins', {
  userId: varchar('user_id').primaryKey(), // 主鍵匹配現有結構
  createdAt: timestamp('created_at').defaultNow().notNull() // 只有這個欄位存在
}, (table) => ({}));

// Authorized Groups Table - GPT功能授權群組
export const authorizedGroups = pgTable('authorized_groups', {
  groupId: varchar('group_id').primaryKey(), // LINE群組ID
  groupName: varchar('group_name'), // 群組名稱（可選）
  description: text('description'), // 授權說明
  isActive: varchar('is_active').default('true').notNull(), // 'true' | 'false'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  isActiveIdx: index('authorized_groups_is_active_idx').on(table.isActive),
  createdAtIdx: index('authorized_groups_created_at_idx').on(table.createdAt.desc())
}));

// Audit Logs Table - 稽核日誌
export const auditLogs = pgTable('audit_logs', {
  id: varchar('id').primaryKey(), // 匹配現有資料庫結構
  level: varchar('level').notNull(), // 'info' | 'warning' | 'error'
  category: varchar('category').notNull(), // 'webhook' | 'llm' | 'scheduler' | 'auth'
  message: text('message').notNull(),
  details: jsonb('details'), // 額外詳細資料
  timestamp: timestamp('timestamp').defaultNow().notNull() // 匹配現有欄位名稱
}, (table) => ({
  timestampIdx: index('audit_logs_timestamp_idx').on(table.timestamp.desc()),
  categoryIdx: index('audit_logs_category_idx').on(table.category),
  levelIdx: index('audit_logs_level_idx').on(table.level)
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

// TypeScript Types
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

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