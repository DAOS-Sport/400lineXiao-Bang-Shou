/**
 * Water Quality Service - 水質監控服務
 * 專門處理 C50c2a9623a78cc5f5e9f39557e3abfe6 群組的水質紀錄
 */

import { storage } from '../storage';
import { lineService } from './lineService';
import { waterQualityMemoryStore } from './waterQualityMemoryStore';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import crypto from 'crypto';

dayjs.extend(utc);
dayjs.extend(timezone);

interface WaterQualityData {
  date: string;
  time: string;
  cl: number;
  ph: number;
  waterTemp: number;
  airTemp: number;
  messageId: string;
  userId: string;
}

export class WaterQualityService {
  private readonly targetGroupId = 'C50c2a9623a78cc5f5e9f39557e3abfe6';

  // 解析水質訊息
  parseWaterQualityMessage(text: string, messageId: string, userId: string): WaterQualityData | null {
    try {
      const lines = text.split('\n').map(line => line.trim());
      
      // 解析日期和時間 (114/8/21 12.10)
      const dateTimePattern = /(\d{3})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2})\.(\d{2})/;
      const dateTimeMatch = lines[0]?.match(dateTimePattern);
      
      if (!dateTimeMatch) return null;
      
      const [, year, month, day, hour, minute] = dateTimeMatch;
      const fullYear = parseInt(year) + 1911; // 民國年轉西元年
      const date = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      
      // 解析水質數據
      let cl = 0, ph = 0, waterTemp = 0, airTemp = 0;
      
      for (const line of lines) {
        if (line.startsWith('CL')) {
          const clMatch = line.match(/CL\s+([\d.]+)/);
          if (clMatch) cl = parseFloat(clMatch[1]);
        }
        if (line.startsWith('PH')) {
          const phMatch = line.match(/PH\s+([\d.]+)/);
          if (phMatch) ph = parseFloat(phMatch[1]);
        }
        if (line.includes('水溫')) {
          const tempMatch = line.match(/水溫\s+([\d.]+)/);
          if (tempMatch) waterTemp = parseFloat(tempMatch[1]);
        }
        if (line.includes('氣溫')) {
          const tempMatch = line.match(/氣溫\s+([\d.]+)/);
          if (tempMatch) airTemp = parseFloat(tempMatch[1]);
        }
      }
      
      // 驗證必要數據
      if (cl === 0 || ph === 0 || waterTemp === 0 || airTemp === 0) {
        return null;
      }
      
      return {
        date,
        time,
        cl,
        ph,
        waterTemp,
        airTemp,
        messageId,
        userId
      };
    } catch (error) {
      console.error('解析水質訊息失敗:', error);
      return null;
    }
  }

  // 儲存水質紀錄
  async saveWaterQualityRecord(data: WaterQualityData): Promise<void> {
    try {
      // 存儲到記憶體快取
      waterQualityMemoryStore.addRecord(data);
      
      // 同時記錄到 audit logs
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'water_quality',
        message: '水質紀錄已記錄',
        details: {
          groupId: this.targetGroupId,
          date: data.date,
          time: data.time,
          cl: data.cl,
          ph: data.ph,
          waterTemp: data.waterTemp,
          airTemp: data.airTemp,
          messageId: data.messageId,
          userId: data.userId
        }
      });
      
      console.log(`💧 水質紀錄已儲存: ${data.date} ${data.time} - CL:${data.cl} PH:${data.ph} 水溫:${data.waterTemp}°C 氣溫:${data.airTemp}°C`);
    } catch (error) {
      console.error('儲存水質紀錄失敗:', error);
    }
  }

  // 檢查是否為水質紀錄訊息
  isWaterQualityMessage(text: string): boolean {
    const hasDateTime = /\d{3}\/\d{1,2}\/\d{1,2}\s+\d{1,2}\.\d{2}/.test(text);
    const hasCL = /CL\s+[\d.]+/.test(text);
    const hasPH = /PH\s+[\d.]+/.test(text);
    const hasWaterTemp = /水溫\s+[\d.]+/.test(text);
    const hasAirTemp = /氣溫\s+[\d.]+/.test(text);
    
    return hasDateTime && hasCL && hasPH && hasWaterTemp && hasAirTemp;
  }

  // 獲取今日水質紀錄
  async getTodayWaterQualityRecords(): Promise<WaterQualityData[]> {
    try {
      // 從記憶體快取獲取今日記錄
      return waterQualityMemoryStore.getTodayRecords();
    } catch (error) {
      console.error('獲取今日水質紀錄失敗:', error);
      return [];
    }
  }

  // 生成每日水質報告
  async generateDailyWaterQualityReport(): Promise<string> {
    try {
      const records = await this.getTodayWaterQualityRecords();
      const today = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD (dddd)');
      
      if (records.length === 0) {
        return `📊 ${today} 水質報告\n\n❌ 今日尚無水質紀錄`;
      }
      
      let report = `📊 ${today} 水質報告\n`;
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `⏰ 時間    💧CL   🔵PH   🌡️水溫  🌡️氣溫\n`;
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      
      for (const record of records) {
        report += `${record.time}   ${record.cl.toFixed(1)}   ${record.ph.toFixed(1)}   ${record.waterTemp}°C   ${record.airTemp}°C\n`;
      }
      
      // 計算平均值
      const avgCL = (records.reduce((sum, r) => sum + r.cl, 0) / records.length).toFixed(1);
      const avgPH = (records.reduce((sum, r) => sum + r.ph, 0) / records.length).toFixed(1);
      const avgWaterTemp = (records.reduce((sum, r) => sum + r.waterTemp, 0) / records.length).toFixed(1);
      const avgAirTemp = (records.reduce((sum, r) => sum + r.airTemp, 0) / records.length).toFixed(1);
      
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `📈 平均值  ${avgCL}   ${avgPH}   ${avgWaterTemp}°C   ${avgAirTemp}°C\n`;
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `✅ 共記錄 ${records.length} 次檢測\n`;
      
      // 水質狀態評估
      const clStatus = parseFloat(avgCL) >= 1.0 && parseFloat(avgCL) <= 3.0 ? '✅正常' : '⚠️異常';
      const phStatus = parseFloat(avgPH) >= 7.2 && parseFloat(avgPH) <= 7.8 ? '✅正常' : '⚠️異常';
      
      report += `\n💡 水質狀態評估：\n`;
      report += `   氯含量：${clStatus} (建議1.0-3.0)\n`;
      report += `   酸鹼值：${phStatus} (建議7.2-7.8)`;
      
      return report;
    } catch (error) {
      console.error('生成水質報告失敗:', error);
      return `📊 水質報告生成失敗\n\n❌ 系統錯誤，請聯繫管理員`;
    }
  }

  // 發送每日水質報告
  async sendDailyWaterQualityReport(): Promise<void> {
    try {
      const report = await this.generateDailyWaterQualityReport();
      await lineService.pushMessage(this.targetGroupId, report);
      
      console.log('📊 每日水質報告已發送');
    } catch (error) {
      console.error('發送水質報告失敗:', error);
    }
  }

  // 處理水質訊息
  async handleWaterQualityMessage(text: string, messageId: string, userId: string, groupId: string): Promise<void> {
    // 只處理指定群組的水質訊息
    if (groupId !== this.targetGroupId) {
      return;
    }
    
    if (!this.isWaterQualityMessage(text)) {
      return;
    }
    
    const data = this.parseWaterQualityMessage(text, messageId, userId);
    if (data) {
      await this.saveWaterQualityRecord(data);
    }
  }
}

export const waterQualityService = new WaterQualityService();