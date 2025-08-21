import { db } from '../db';
import { messages, messageBackups, auditLogs } from '@shared/schema';
import { eq, gte, and, desc } from 'drizzle-orm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import crypto from 'crypto';

dayjs.extend(utc);
dayjs.extend(timezone);

export class SimpleBackupService {
  private readonly timezone = 'Asia/Taipei';

  /**
   * 每日備份所有訊息到備份表
   */
  async performDailyBackup(): Promise<boolean> {
    try {
      const backupDate = dayjs().tz(this.timezone).format('YYYY-MM-DD');
      const yesterday = dayjs().tz(this.timezone).subtract(1, 'day').startOf('day').toDate();
      
      console.log(`🗄️ 開始每日備份 ${backupDate}`);

      // 查詢昨天的所有訊息
      const yesterdayMessages = await db.select().from(messages)
        .where(gte(messages.timestamp, yesterday))
        .orderBy(messages.timestamp);

      if (yesterdayMessages.length === 0) {
        console.log('📝 昨天沒有訊息需要備份');
        return true;
      }

      // 儲存到備份表
      await db.insert(messageBackups).values({
        backupDate,
        backupType: 'daily',
        totalMessages: yesterdayMessages.length.toString(),
        backupData: yesterdayMessages,
        metadata: {
          backupTime: dayjs().tz(this.timezone).toISOString(),
          messageCount: yesterdayMessages.length,
          dateFrom: yesterday.toISOString(),
          timezone: this.timezone
        }
      });

      // 記錄到稽核日誌
      await db.insert(auditLogs).values({
        level: 'info',
        category: 'backup',
        message: `每日備份完成：${yesterdayMessages.length} 條訊息`,
        details: {
          backupDate,
          messageCount: yesterdayMessages.length,
          backupType: 'daily'
        }
      });

      console.log(`✅ 每日備份完成：${yesterdayMessages.length} 條訊息`);
      return true;

    } catch (error) {
      console.error('❌ 每日備份失敗:', error);
      
      // 記錄錯誤到稽核日誌
      try {
        await db.insert(auditLogs).values({
          level: 'error',
          category: 'backup',
          message: '每日備份失敗',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            backupDate: dayjs().tz(this.timezone).format('YYYY-MM-DD')
          }
        });
      } catch (logError) {
        console.error('無法記錄備份錯誤:', logError);
      }

      return false;
    }
  }

  /**
   * 手動備份指定群組的訊息
   */
  async backupGroupMessages(groupId: string, days: number = 7): Promise<boolean> {
    try {
      const backupDate = dayjs().tz(this.timezone).format('YYYY-MM-DD');
      const startDate = dayjs().tz(this.timezone).subtract(days, 'day').startOf('day').toDate();
      
      console.log(`🗄️ 開始備份群組 ${groupId} 最近 ${days} 天的訊息`);

      const groupMessages = await db.select().from(messages)
        .where(
          and(
            eq(messages.groupId, groupId),
            gte(messages.timestamp, startDate)
          )
        )
        .orderBy(messages.timestamp);

      if (groupMessages.length === 0) {
        console.log(`📝 群組 ${groupId} 沒有訊息需要備份`);
        return true;
      }

      await db.insert(messageBackups).values({
        backupDate,
        backupType: 'manual',
        totalMessages: groupMessages.length.toString(),
        groupId,
        backupData: groupMessages,
        metadata: {
          backupTime: dayjs().tz(this.timezone).toISOString(),
          messageCount: groupMessages.length,
          groupId,
          daysBack: days,
          timezone: this.timezone
        }
      });

      await db.insert(auditLogs).values({
        level: 'info',
        category: 'backup',
        message: `群組手動備份完成：${groupMessages.length} 條訊息`,
        details: {
          backupDate,
          groupId,
          messageCount: groupMessages.length,
          daysBack: days,
          backupType: 'manual'
        }
      });

      console.log(`✅ 群組備份完成：${groupMessages.length} 條訊息`);
      return true;

    } catch (error) {
      console.error(`❌ 群組 ${groupId} 備份失敗:`, error);
      return false;
    }
  }

  /**
   * 查詢備份歷史
   */
  async getBackupHistory(limit: number = 10): Promise<any[]> {
    try {
      return await db.select({
        backupDate: messageBackups.backupDate,
        backupType: messageBackups.backupType,
        totalMessages: messageBackups.totalMessages,
        groupId: messageBackups.groupId,
        createdAt: messageBackups.createdAt,
        metadata: messageBackups.metadata
      }).from(messageBackups)
        .orderBy(desc(messageBackups.createdAt))
        .limit(limit);

    } catch (error) {
      console.error('查詢備份歷史失敗:', error);
      return [];
    }
  }

  /**
   * 檢查備份設定並初始化
   */
  async initializeBackupSystem(): Promise<void> {
    try {
      console.log('🔧 初始化備份系統...');
      
      // 檢查備份表是否存在（透過嘗試查詢）
      await db.select().from(messageBackups).limit(1);
      
      console.log('✅ 備份系統初始化完成');
      
    } catch (error) {
      console.error('❌ 備份系統初始化失敗:', error);
      throw error;
    }
  }
}

export const simpleBackupService = new SimpleBackupService();