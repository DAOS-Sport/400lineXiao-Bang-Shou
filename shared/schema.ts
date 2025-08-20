import { pgTable, varchar, text, timestamp, jsonb, serial, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Messages Table - 訊息原始存證
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  timestampIdx: index('messages_timestamp_idx').on(table.timestamp.desc()),
  groupIdIdx: index('messages_group_id_idx').on(table.groupId),
  userIdIdx: index('messages_user_id_idx').on(table.userId),
  sourceTypeIdx: index('messages_source_type_idx').on(table.sourceType),
  messageIdIdx: uniqueIndex('messages_message_id_idx').on(table.messageId)
}));

// Tasks Table - 任務管理
export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  groupId: varchar('group_id').notNull(), // 任務來源群組
  taskSerial: varchar('task_serial').notNull(), // 群組內的任務編號 (01, 02, ...)
  createdBy: varchar('created_by').notNull(), // 建立任務的 userId
  creatorName: varchar('creator_name'), // 建立者顯示名稱
  description: text('description').notNull(), // 任務內容
  status: varchar('status').notNull().default('pending'), // 'pending' | 'completed'
  completedAt: timestamp('completed_at'), // 完成時間（如有）
  context: jsonb('context').notNull().default('[]'), // 任務相關的對話片段 messageId 陣列
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  groupSerialIdx: uniqueIndex('tasks_group_serial_idx').on(table.groupId, table.taskSerial),
  groupStatusIdx: index('tasks_group_status_idx').on(table.groupId, table.status),
  createdAtIdx: index('tasks_created_at_idx').on(table.createdAt.desc())
}));

// Admins Table - 白名單 / 權限控管
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').notNull().unique(), // LINE userId
  role: varchar('role').notNull().default('admin'), // 'admin' | 'member'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  userIdIdx: uniqueIndex('admins_user_id_idx').on(table.userId)
}));

// Audit Logs Table - 稽核日誌
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  level: varchar('level').notNull(), // 'info' | 'warning' | 'error'
  category: varchar('category').notNull(), // 'webhook' | 'llm' | 'scheduler' | 'auth'
  message: text('message').notNull(),
  details: jsonb('details'), // 額外詳細資料
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt.desc()),
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
  createdAt: true,
  updatedAt: true
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// TypeScript Types
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Interface compatibility for existing code
export interface IMessage {
  id: number;
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
  updatedAt: Date;
}

export interface ITask {
  id: number;
  groupId: string;
  taskSerial: string;
  createdBy: string;
  creatorName?: string | null;
  description: string;
  status: string;
  completedAt?: Date | null;
  context: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdmin {
  id: number;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuditLog {
  id: number;
  level: string;
  category: string;
  message: string;
  details?: any;
  createdAt: Date;
  updatedAt: Date;
}

// Create Data interfaces for compatibility
export interface CreateMessageData {
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
  groupId: string;
  taskSerial: string;
  createdBy: string;
  creatorName?: string;
  description: string;
  status?: string;
  context?: any;
}

export interface CreateAdminData {
  userId: string;
  role?: string;
}

export interface CreateAuditLogData {
  level: string;
  category: string;
  message: string;
  details?: any;
}