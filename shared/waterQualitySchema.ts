import { pgTable, varchar, text, timestamp, decimal, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * 水質紀錄資料表
 */
export const waterQualityRecords = pgTable('water_quality_records', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: text('group_id').notNull(),
  messageId: text('message_id').notNull(),
  recordDate: text('record_date').notNull(), // YYYY-MM-DD 格式
  recordTime: text('record_time').notNull(), // HH:MM 格式
  chlorineLevel: decimal('chlorine_level', { precision: 3, scale: 1 }), // CL 氯含量
  phLevel: decimal('ph_level', { precision: 3, scale: 1 }), // PH 酸鹼值
  waterTemperature: decimal('water_temperature', { precision: 4, scale: 1 }), // 水溫
  airTemperature: decimal('air_temperature', { precision: 4, scale: 1 }), // 氣溫
  reporterUserId: text('reporter_user_id').notNull(),
  rawMessage: text('raw_message').notNull(), // 原始訊息內容
  extractedData: jsonb('extracted_data'), // 提取的結構化數據
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * 水質警報設定
 */
export const waterQualityAlerts = pgTable('water_quality_alerts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: text('group_id').notNull(),
  parameterType: text('parameter_type').notNull(), // 'chlorine', 'ph', 'water_temp', 'air_temp'
  minValue: decimal('min_value', { precision: 5, scale: 2 }),
  maxValue: decimal('max_value', { precision: 5, scale: 2 }),
  alertMessage: text('alert_message'),
  isActive: text('is_active').notNull().default('true'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export type WaterQualityRecord = typeof waterQualityRecords.$inferSelect;
export type CreateWaterQualityRecord = typeof waterQualityRecords.$inferInsert;
export type WaterQualityAlert = typeof waterQualityAlerts.$inferSelect;
export type CreateWaterQualityAlert = typeof waterQualityAlerts.$inferInsert;