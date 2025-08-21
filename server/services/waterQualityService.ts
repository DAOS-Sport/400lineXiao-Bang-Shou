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
  poolType?: string; // 池子類型（新群組使用）
  additionalInfo?: any; // 額外資訊（如加藥量、鍋爐狀態）
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
  async saveWaterQualityRecord(data: WaterQualityData, groupId: string): Promise<void> {
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
          groupId: groupId,
          date: data.date,
          time: data.time,
          cl: data.cl,
          ph: data.ph,
          waterTemp: data.waterTemp,
          airTemp: data.airTemp,
          messageId: data.messageId,
          userId: data.userId,
          ...(data.poolType && { poolType: data.poolType }),
          ...(data.additionalInfo && { additionalInfo: data.additionalInfo })
        }
      });
      
      console.log(`💧 水質紀錄已儲存 [${groupId}]: ${data.date} ${data.time} - CL:${data.cl} PH:${data.ph} 水溫:${data.waterTemp}°C ${data.poolType ? `池子:${data.poolType}` : ''}`);
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

  // 檢查是否為多池水質紀錄訊息（新群組格式）
  isMultiPoolWaterQualityMessage(text: string): boolean {
    const hasDate = /\d{3}\s+\d{2}\.\d{2}/.test(text); // 114 08.21 格式
    const hasCL = /CL\s+[\d.]+/.test(text);
    const hasPH = /PH\s+[\d.]+/.test(text);
    const hasWaterTemp = /水溫\s+[\d.]+/.test(text);
    const hasPoolSeparator = /———/.test(text); // 池子分隔符號
    
    return hasDate && hasCL && hasPH && hasWaterTemp && hasPoolSeparator;
  }

  // 解析多池水質訊息（新群組格式）
  parseMultiPoolWaterQualityMessage(text: string, messageId: string, userId: string, groupId: string): WaterQualityData | null {
    try {
      const lines = text.split('\n').map(line => line.trim());
      
      // 解析日期 (114 08.21)
      const datePattern = /(\d{3})\s+(\d{2})\.(\d{2})/;
      const dateMatch = lines[0]?.match(datePattern);
      
      if (!dateMatch) return null;
      
      const [, year, month, day] = dateMatch;
      const fullYear = parseInt(year) + 1911; // 民國年轉西元年
      const date = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // 使用當前時間作為記錄時間
      const now = dayjs().tz('Asia/Taipei');
      const time = now.format('HH:mm');
      
      // 解析各個池子的數據，取第一個完整的池子數據
      const pools = text.split('———').filter(section => section.trim());
      
      for (const poolSection of pools) {
        const poolLines = poolSection.split('\n').map(line => line.trim());
        
        let poolName = '';
        let cl = 0, ph = 0, waterTemp = 0;
        const additionalInfo: any = {};
        
        for (const line of poolLines) {
          // 識別池子名稱
          if (line.includes('大池') || line.includes('兒童')) {
            poolName = '大池&兒童池';
          } else if (line.includes('SPA')) {
            poolName = 'SPA池';
          } else if (line.includes('熱水池')) {
            poolName = '熱水池';
          } else if (line.includes('冷水池')) {
            poolName = '冷水池';
          }
          
          // 解析數值
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
          if (line.includes('加藥量')) {
            const medicineMatch = line.match(/加藥量\s*(.+)/);
            if (medicineMatch) additionalInfo.medicine = medicineMatch[1].trim();
          }
          if (line.includes('鍋爐')) {
            const boilerMatch = line.match(/鍋爐\s*(.+)/);
            if (boilerMatch) additionalInfo.boiler = boilerMatch[1].trim();
          }
        }
        
        // 如果這個池子有完整數據，就回傳（只記錄第一個有效池子）
        if (poolName && cl > 0 && ph > 0 && waterTemp > 0) {
          return {
            date,
            time,
            cl,
            ph,
            waterTemp,
            airTemp: waterTemp, // 新群組沒有氣溫，用水溫代替
            messageId,
            userId,
            poolType: poolName,
            additionalInfo
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('解析多池水質訊息失敗:', error);
      return null;
    }
  }

  // 獲取今日水質紀錄（支援多群組）
  async getTodayWaterQualityRecords(groupId?: string): Promise<WaterQualityData[]> {
    try {
      const today = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
      const targetGroupId = groupId || this.targetGroupId;
      
      // 先從記憶體快取獲取
      const memoryRecords = waterQualityMemoryStore.getTodayRecords();
      
      // 同時從資料庫獲取（審計日誌中的水質記錄）
      const auditLogs = await storage.getAuditLogs(100);
      
      const dbRecords = auditLogs
        .filter(log => 
          log.category === 'water_quality' && 
          log.details?.date === today && 
          log.details?.groupId === targetGroupId
        )
        .map(log => ({
          date: log.details.date as string,
          time: log.details.time as string,
          cl: log.details.cl as number,
          ph: log.details.ph as number,
          waterTemp: log.details.waterTemp as number,
          airTemp: log.details.airTemp as number,
          messageId: log.details.messageId as string,
          userId: log.details.userId as string,
          poolType: log.details.poolType as string,
          additionalInfo: log.details.additionalInfo as any
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
      
      // 合併並去重（以 date + time + poolType 為鍵值）
      const allRecords = [...memoryRecords, ...dbRecords];
      const uniqueRecords = allRecords.reduce((acc, record) => {
        const key = `${record.date}-${record.time}-${record.poolType || 'default'}`;
        if (!acc.find(r => `${r.date}-${r.time}-${r.poolType || 'default'}` === key)) {
          acc.push(record);
        }
        return acc;
      }, [] as WaterQualityData[]);
      
      return uniqueRecords.sort((a, b) => a.time.localeCompare(b.time));
    } catch (error) {
      console.error('獲取今日水質紀錄失敗:', error);
      return [];
    }
  }

  // 生成每日水質報告（支援多群組）
  async generateDailyWaterQualityReport(groupId?: string): Promise<string> {
    try {
      const records = await this.getTodayWaterQualityRecords(groupId);
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
      console.log('🚀 開始生成水質報告...');
      
      // 支援的群組列表
      const supportedGroups = ['C50c2a9623a78cc5f5e9f39557e3abfe6', 'C9b3c5dfe2e005adafd2ed914714a1930'];
      
      for (const groupId of supportedGroups) {
        try {
          const report = await this.generateDailyWaterQualityReport(groupId);
          
          // 使用智能延遲發送機制
          await lineService.sendToGroup(groupId, report);
          
          console.log(`✅ 水質報告已安排發送至群組: ${groupId}`);
        } catch (error) {
          console.error(`❌ 群組 ${groupId} 水質報告發送失敗:`, error);
          
          // 記錄錯誤到audit logs
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'error',
            category: 'water_quality_report',
            message: `群組 ${groupId} 水質報告發送失敗`,
            details: { error: (error as Error).message, groupId }
          });
        }
      }
      
      console.log('✅ 所有群組水質報告處理完成');
    } catch (error) {
      console.error('❌ 水質報告總體處理失敗:', error);
    }
  }

  // 處理水質訊息
  async handleWaterQualityMessage(text: string, messageId: string, userId: string, groupId: string): Promise<void> {
    // 支援多個群組的水質訊息處理
    const supportedGroups = ['C50c2a9623a78cc5f5e9f39557e3abfe6', 'C9b3c5dfe2e005adafd2ed914714a1930'];
    if (!supportedGroups.includes(groupId)) {
      return;
    }
    
    // 根據群組選擇解析方式
    let data: WaterQualityData | null = null;
    
    if (groupId === 'C50c2a9623a78cc5f5e9f39557e3abfe6') {
      // 原有群組：使用原有解析方式
      if (this.isWaterQualityMessage(text)) {
        data = this.parseWaterQualityMessage(text, messageId, userId);
      }
    } else if (groupId === 'C9b3c5dfe2e005adafd2ed914714a1930') {
      // 新群組：使用新的多池解析方式
      if (this.isMultiPoolWaterQualityMessage(text)) {
        data = this.parseMultiPoolWaterQualityMessage(text, messageId, userId, groupId);
      }
    }
    
    if (data) {
      await this.saveWaterQualityRecord(data, groupId);
    }
  }
}

export const waterQualityService = new WaterQualityService();