import { pgTable, varchar, text, timestamp, jsonb, serial, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
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

// Outgoing Messages Table - Bot 傳出訊息紀錄（reply / push 全紀錄）
export const outgoingMessages = pgTable('outgoing_messages', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  to: text('to').notNull(), // groupId (C...) 或 userId (U...)
  toType: text('to_type').notNull(), // 'group' | 'user' | 'room'
  sendType: text('send_type').notNull(), // 'reply' | 'push'
  messageType: text('message_type').notNull(), // 'text' | 'image' | 'video' | 'multi' | 'quickReply'
  text: text('text'), // 文字內容（多訊息時為摘要）
  payload: jsonb('payload'), // 完整 LINE message payload
  status: text('status').notNull(), // 'sent' | 'failed'
  errorMessage: text('error_message'), // 失敗原因（若 status=failed）
  triggeredBy: text('triggered_by'), // 觸發來源：'webhook' | 'scheduler' | 'admin' | 'manual'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  toIdx: index('outgoing_messages_to_idx').on(table.to),
  createdAtIdx: index('outgoing_messages_created_at_idx').on(table.createdAt.desc()),
  statusIdx: index('outgoing_messages_status_idx').on(table.status)
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

// Interview Authorized Users Table - 面試模組授權人員
export const interviewAuthorizedUsers = pgTable('interview_authorized_users', {
  userId: text('user_id').primaryKey(), // LINE User ID
  userName: text('user_name').notNull(), // 使用者姓名
  canInterviewCheck: text('can_interview_check').default('true').notNull(), // 可使用面試檢核模組
  canInternalQuery: text('can_internal_query').default('true').notNull(), // 可使用內部查詢模組
  canUseAiAgent: text('can_use_ai_agent').default('false').notNull(), // 可使用 AI 智能客服
  isActive: text('is_active').default('true').notNull(), // 是否啟用
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  isActiveIdx: index('interview_authorized_users_is_active_idx').on(table.isActive),
  createdAtIdx: index('interview_authorized_users_created_at_idx').on(table.createdAt.desc())
}));

// Employee Cache Table - 員工快取（加速 ID 查詢）
export const employeeCache = pgTable('employee_cache', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`), // 主鍵
  lineId: text('line_id').notNull().unique(), // 個人LINE ID，唯一鍵
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

// ========== 重要事項公告歸納器 ==========

// Announcement Candidates Table - 公告候選項目
export const announcementCandidates = pgTable('announcement_candidates', {
  id: serial('id').primaryKey(),
  sourceMessageId: text('source_message_id'), // 來源 messages.messageId
  groupId: text('group_id').notNull(),
  facilityName: text('facility_name'), // 場館名稱（由 groupId 對應）
  userId: text('user_id'),
  displayName: text('display_name'),
  originalText: text('original_text').notNull(),
  isFromSupervisor: text('is_from_supervisor').notNull().default('false'),
  candidateType: text('candidate_type').notNull().default('ignore'), // rule | notice | campaign | discount | script | ignore
  scopeType: text('scope_type').notNull().default('group'),           // group | facility | multi_facility | global
  title: text('title'),
  summary: text('summary'),
  recommendedAction: text('recommended_action'),
  badExample: text('bad_example'),
  recommendedReply: text('recommended_reply'),
  appliesToRoles: jsonb('applies_to_roles'), // string[]
  startAt: timestamp('start_at', { withTimezone: true }),
  endAt: timestamp('end_at', { withTimezone: true }),
  confidence: text('confidence').notNull().default('0'),
  reasoningTags: jsonb('reasoning_tags'), // string[]
  extractedJson: jsonb('extracted_json'), // 完整 GPT 輸出（含 5W1H）
  priority: text('priority'), // must_read | high | normal | low（由 AI 輸出）
  contentHash: text('content_hash'), // sha256(title+summary+groupId+date) 用於去重
  status: text('status').notNull().default('pending_review'), // pending_review | approved | rejected | ignored
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  groupIdIdx: index('ann_candidates_group_id_idx').on(table.groupId),
  statusIdx: index('ann_candidates_status_idx').on(table.status),
  candidateTypeIdx: index('ann_candidates_type_idx').on(table.candidateType),
  detectedAtIdx: index('ann_candidates_detected_at_idx').on(table.detectedAt.desc()),
  contentHashIdx: index('ann_candidates_content_hash_idx').on(table.groupId, table.contentHash, table.detectedAt),
}));

// Announcement Reviews Table - 公告審核記錄
export const announcementReviews = pgTable('announcement_reviews', {
  id: serial('id').primaryKey(),
  candidateId: integer('candidate_id').notNull(),
  reviewerUserId: text('reviewer_user_id'),
  action: text('action').notNull(), // approve | reject
  comment: text('comment'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  candidateIdIdx: index('ann_reviews_candidate_id_idx').on(table.candidateId),
  reviewedAtIdx: index('ann_reviews_reviewed_at_idx').on(table.reviewedAt.desc()),
}));

export const insertAnnouncementCandidateSchema = createInsertSchema(announcementCandidates).omit({
  id: true,
  detectedAt: true,
});
export const insertAnnouncementReviewSchema = createInsertSchema(announcementReviews).omit({
  id: true,
  reviewedAt: true,
});

export type AnnouncementCandidate = typeof announcementCandidates.$inferSelect;
export type InsertAnnouncementCandidate = z.infer<typeof insertAnnouncementCandidateSchema>;
export type AnnouncementReview = typeof announcementReviews.$inferSelect;
export type InsertAnnouncementReview = z.infer<typeof insertAnnouncementReviewSchema>;

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

// ========== 身份分層設計 ==========

// Users Table - 系統內部用戶主表（與外部 ID 解耦）
export const users = pgTable('users', {
  id: serial('id').primaryKey(),                               // 系統內部主鍵
  employeeId: text('employee_id').unique(),                    // 員工系統編號（可空）
  lineUserId: text('line_user_id').unique(),                   // LINE user ID（可空）
  displayName: text('display_name'),                          // 顯示名稱
  role: text('role').notNull().default('staff'),               // admin | supervisor | staff
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  employeeIdIdx: uniqueIndex('users_employee_id_idx').on(table.employeeId),
  lineUserIdIdx: uniqueIndex('users_line_user_id_idx').on(table.lineUserId),
  roleIdx: index('users_role_idx').on(table.role),
}));

// User Identity Mappings Table - 外部 ID 對應表（LINE / 員工系統 / Portal 等）
export const userIdentityMappings = pgTable('user_identity_mappings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),                        // 對應 users.id
  provider: text('provider').notNull(),                        // 'line' | 'employee_system' | 'portal'
  externalId: text('external_id').notNull(),                   // 外部系統 ID（LINE UID / 員工編號 / 其他）
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('uim_user_id_idx').on(table.userId),
  providerExternalIdx: uniqueIndex('uim_provider_external_idx').on(table.provider, table.externalId),
}));

// ========== 場館登錄 ==========

// Facilities Table - 館別主表
export const facilities = pgTable('facilities', {
  id: serial('id').primaryKey(),
  lineGroupId: text('line_group_id').unique(),                 // 對應 LINE 工作群 ID
  name: text('name').notNull(),                                // 完整名稱
  shortName: text('short_name'),                               // 縮寫
  tier: text('tier').notNull().default('A'),                   // 'A' | 'B' | 'C'
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  lineGroupIdIdx: uniqueIndex('facilities_line_group_id_idx').on(table.lineGroupId),
  tierIdx: index('facilities_tier_idx').on(table.tier),
}));

// ========== 已發布公告池（Step 2：審核通過後轉入） ==========

// Published Announcements Table - 已發布重要公告
export const publishedAnnouncements = pgTable('published_announcements', {
  id: serial('id').primaryKey(),
  sourceCandidateId: integer('source_candidate_id').notNull(), // 關聯 announcement_candidates.id
  sourcePrimaryLineGroupId: text('source_primary_line_group_id'), // 原始 LINE 群組 ID
  sourceGroupIdsJson: jsonb('source_group_ids_json').default([]), // 合併多來源群組

  facilityId: integer('facility_id'),                          // 關聯 facilities.id
  facilityLineGroupId: text('facility_line_group_id'),         // 冗餘欄：方便不 JOIN 直接查

  candidateType: text('candidate_type').notNull(),             // rule | notice | campaign | discount | script
  scopeType: text('scope_type').notNull(),                     // group | facility | multi_facility | global

  title: text('title').notNull(),
  summary: text('summary').notNull(),
  body: text('body'),
  recommendedAction: text('recommended_action'),
  recommendedReply: text('recommended_reply'),
  badExample: text('bad_example'),

  appliesToRolesJson: jsonb('applies_to_roles_json').default([]),       // string[]
  appliesToFacilityIdsJson: jsonb('applies_to_facility_ids_json').default([]), // number[]

  priority: text('priority').notNull().default('normal'),              // critical | high | normal | low
  homeVisibility: text('home_visibility').notNull().default('normal'), // pinned | normal | hidden
  needsAck: boolean('needs_ack').notNull().default(false),

  effectiveStartAt: timestamp('effective_start_at', { withTimezone: true }),
  effectiveEndAt: timestamp('effective_end_at', { withTimezone: true }),
  isAllDay: boolean('is_all_day').notNull().default(true),

  extractedJson: jsonb('extracted_json'),                              // 5W1H + AI 輸出
  publishedByUserId: integer('published_by_user_id'),                  // 關聯 users.id
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull().default('published'),               // published | archived | expired | hidden

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  facilityLineGroupIdx: index('pub_ann_facility_line_group_idx').on(table.facilityLineGroupId),
  statusIdx: index('pub_ann_status_idx').on(table.status),
  priorityIdx: index('pub_ann_priority_idx').on(table.priority),
  homeVisibilityIdx: index('pub_ann_home_visibility_idx').on(table.homeVisibility),
  publishedAtIdx: index('pub_ann_published_at_idx').on(table.publishedAt.desc()),
  effectiveEndAtIdx: index('pub_ann_effective_end_at_idx').on(table.effectiveEndAt),
  sourceCandidateIdx: index('pub_ann_source_candidate_idx').on(table.sourceCandidateId),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserIdentityMappingSchema = createInsertSchema(userIdentityMappings).omit({ id: true, createdAt: true });
export const insertFacilitySchema = createInsertSchema(facilities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPublishedAnnouncementSchema = createInsertSchema(publishedAnnouncements).omit({
  id: true, publishedAt: true, createdAt: true, updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserIdentityMapping = typeof userIdentityMappings.$inferSelect;
export type Facility = typeof facilities.$inferSelect;
export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type PublishedAnnouncement = typeof publishedAnnouncements.$inferSelect;
export type InsertPublishedAnnouncement = z.infer<typeof insertPublishedAnnouncementSchema>;

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

// Outgoing Messages interfaces
export interface IOutgoingMessage {
  id: string;
  to: string;
  toType: string;
  sendType: string;
  messageType: string;
  text?: string | null;
  payload?: any;
  status: string;
  errorMessage?: string | null;
  triggeredBy?: string | null;
  createdAt: Date;
}

export interface CreateOutgoingMessageData {
  to: string;
  toType: string;
  sendType: 'reply' | 'push';
  messageType: string;
  text?: string;
  payload?: any;
  status: 'sent' | 'failed';
  errorMessage?: string;
  triggeredBy?: string;
}

// ── T003：公告白名單（外部化 VIP_USERS） ─────────────────────────────────────

export const announcementWhitelistUsers = pgTable('announcement_whitelist_users', {
  userId: text('user_id').primaryKey(),
  userName: text('user_name').notNull(),
  role: text('role').default('vip').notNull(), // 'vip' | 'supervisor_hint'
  note: text('note'),
  isActive: boolean('is_active').default(true).notNull(),
  addedBy: text('added_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AnnouncementWhitelistUser = typeof announcementWhitelistUsers.$inferSelect;

// ── T003：服務健康快照 ────────────────────────────────────────────────────────

export const serviceHealthSnapshots = pgTable('service_health_snapshots', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  snappedAt: timestamp('snapped_at', { withTimezone: true }).defaultNow().notNull(),
  overallStatus: text('overall_status').notNull(),
  servicesJson: jsonb('services_json').default([]).notNull(),
  triggeredBy: text('triggered_by'),
  webhookSentAt: timestamp('webhook_sent_at', { withTimezone: true }),
  webhookStatus: text('webhook_status'),
});

export type ServiceHealthSnapshot = typeof serviceHealthSnapshots.$inferSelect;

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