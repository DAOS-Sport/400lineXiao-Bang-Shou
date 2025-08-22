/**
 * Water Quality Service - 水質監控服務
 * 專門處理 C50c2a9623a78cc5f5e9f39557e3abfe6 群組的水質紀錄
 */

import { storage } from '../storage';
import { lineService } from './lineService';
import { waterQualityMemoryStore } from './waterQualityMemoryStore';
import { llmService } from './llmService';
import { weatherService } from './weatherService';
import { type IMessage } from "@shared/schema";
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

  // 解析水質訊息（改善版，支援多種格式）
  parseWaterQualityMessage(text: string, messageId: string, userId: string): WaterQualityData | null {
    try {
      const lines = text.split('\n').map(line => line.trim());
      const fullText = text.replace(/\n/g, ' '); // 也檢查整行格式
      
      // 多種日期時間格式支援
      let year = '', month = '', day = '', hour = '', minute = '';
      
      // 格式1: 114/8/21 12.10 (同行)
      const dateTimePattern1 = /(\d{3})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2})[.:](\d{2})/;
      const dateTimeMatch1 = fullText.match(dateTimePattern1);
      
      // 格式2: 114/8/22 06:21 (分行或同行)
      const datePattern = /(\d{3})\/(\d{1,2})\/(\d{1,2})/;
      const timePattern = /(\d{1,2}):(\d{2})/;
      
      if (dateTimeMatch1) {
        [, year, month, day, hour, minute] = dateTimeMatch1;
      } else {
        // 尋找日期和時間（可能在不同行）
        const dateMatch = fullText.match(datePattern);
        const timeMatch = fullText.match(timePattern);
        
        if (dateMatch && timeMatch) {
          [, year, month, day] = dateMatch;
          [, hour, minute] = timeMatch;
        } else {
          console.log('❌ 無法解析日期時間格式:', fullText);
          return null;
        }
      }
      
      const fullYear = parseInt(year) + 1911; // 民國年轉西元年
      const date = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      
      // 解析水質數據（支援多種格式）
      let cl = 0, ph = 0, waterTemp = 0, airTemp = 0;
      
      // 檢查整個文本中的數值
      const clMatch = fullText.match(/CL\s+([\d.]+)/);
      const phMatch = fullText.match(/PH\s+([\d.]+)/);
      const waterTempMatch = fullText.match(/水溫\s+([\d.]+)/);
      const airTempMatch = fullText.match(/氣溫\s+([\d.]+)/);
      
      if (clMatch) cl = parseFloat(clMatch[1]);
      if (phMatch) ph = parseFloat(phMatch[1]);
      if (waterTempMatch) waterTemp = parseFloat(waterTempMatch[1]);
      if (airTempMatch) airTemp = parseFloat(airTempMatch[1]);
      
      // 也檢查逐行格式
      for (const line of lines) {
        if (line.startsWith('CL') && cl === 0) {
          const lineClMatch = line.match(/CL\s+([\d.]+)/);
          if (lineClMatch) cl = parseFloat(lineClMatch[1]);
        }
        if (line.startsWith('PH') && ph === 0) {
          const linePhMatch = line.match(/PH\s+([\d.]+)/);
          if (linePhMatch) ph = parseFloat(linePhMatch[1]);
        }
        if (line.includes('水溫') && waterTemp === 0) {
          const lineTempMatch = line.match(/水溫\s+([\d.]+)/);
          if (lineTempMatch) waterTemp = parseFloat(lineTempMatch[1]);
        }
        if (line.includes('氣溫') && airTemp === 0) {
          const lineAirTempMatch = line.match(/氣溫\s+([\d.]+)/);
          if (lineAirTempMatch) airTemp = parseFloat(lineAirTempMatch[1]);
        }
      }
      
      // 驗證必要數據
      if (cl === 0 || ph === 0 || waterTemp === 0 || airTemp === 0) {
        console.log('❌ 水質數據不完整:', { cl, ph, waterTemp, airTemp });
        return null;
      }
      
      console.log('✅ 成功解析水質數據:', { date, time, cl, ph, waterTemp, airTemp });
      
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

  // 檢查是否為水質紀錄訊息（改善版）
  isWaterQualityMessage(text: string): boolean {
    // 支援多種日期時間格式
    const hasDateTime1 = /\d{3}\/\d{1,2}\/\d{1,2}\s+\d{1,2}[.:]\d{2}/.test(text); // 114/8/21 12.10
    const hasDateTime2 = /\d{3}\/\d{1,2}\/\d{1,2}/.test(text) && /\d{1,2}:\d{2}/.test(text); // 114/8/22 和 06:21 分開
    
    const hasCL = /CL\s+[\d.]+/.test(text);
    const hasPH = /PH\s+[\d.]+/.test(text);
    const hasWaterTemp = /水溫\s+[\d.]+/.test(text);
    const hasAirTemp = /氣溫\s+[\d.]+/.test(text);
    
    const hasDateTime = hasDateTime1 || hasDateTime2;
    const hasAllData = hasCL && hasPH && hasWaterTemp && hasAirTemp;
    
    return hasDateTime && hasAllData;
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
        const poolType = (record as any).poolType || 'default';
        const key = `${record.date}-${record.time}-${poolType}`;
        if (!acc.find(r => {
          const rPoolType = (r as any).poolType || 'default';
          return `${r.date}-${r.time}-${rPoolType}` === key;
        })) {
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

  // 生成每日水質報告（支援多群組，整合天氣預報和趨勢分析）
  async generateDailyWaterQualityReport(groupId?: string): Promise<string> {
    try {
      const records = await this.getTodayWaterQualityRecords(groupId);
      const today = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD (dddd)');
      
      // 獲取天氣預報
      const weatherForecasts = await weatherService.getHsinchuWeatherForecast();
      const weatherAdvice = weatherService.generateWaterQualityAdvice(weatherForecasts);
      
      if (records.length === 0) {
        // 即使沒有水質記錄，也提供天氣和建議
        let report = `📊 ${today} 水質報告\n\n❌ 今日尚無水質紀錄\n\n`;
        report += `🌤️ 新竹科學園區天氣預報\n`;
        report += weatherService.formatWeatherForecast(weatherForecasts);
        report += `\n\n🔧 ${weatherAdvice.waterQualityAdvice}`;
        if (weatherAdvice.recommendations.length > 0) {
          report += `\n💡 建議：${weatherAdvice.recommendations.join('、')}`;
        }
        return report;
      }
      
      // 🔧 簡化版水質報告格式
      const dateStr = dayjs().tz('Asia/Taipei').format('M/D');
      
      let report = `🏊‍♂️ 游泳池水質日報\n`;
      report += `📅 日期: ${dateStr} | 📊 檢測: ${records.length}次\n`;
      report += `━━━━━━━━━━━━━━━━\n`;
      
      // 統計分析
      const avgCL = (records.reduce((sum, r) => sum + r.cl, 0) / records.length);
      const avgPH = (records.reduce((sum, r) => sum + r.ph, 0) / records.length);
      const avgWaterTemp = (records.reduce((sum, r) => sum + r.waterTemp, 0) / records.length);
      const avgAirTemp = (records.reduce((sum, r) => sum + r.airTemp, 0) / records.length);
      
      // 數據範圍
      const clRange = [Math.min(...records.map(r => r.cl)), Math.max(...records.map(r => r.cl))];
      const phRange = [Math.min(...records.map(r => r.ph)), Math.max(...records.map(r => r.ph))];
      const waterTempRange = [Math.min(...records.map(r => r.waterTemp)), Math.max(...records.map(r => r.waterTemp))];
      const airTempRange = [Math.min(...records.map(r => r.airTemp)), Math.max(...records.map(r => r.airTemp))];
      
      report += `\n【數據摘要】\n`;
      report += `🧪 氯含量: ${avgCL.toFixed(1)} mg/L (範圍 ${clRange[0]}-${clRange[1]})\n`;
      report += `⚖️  pH值: ${avgPH.toFixed(1)} (範圍 ${phRange[0]}-${phRange[1]})\n`;
      report += `🌡️ 水溫: ${avgWaterTemp.toFixed(1)}°C (範圍 ${waterTempRange[0]}-${waterTempRange[1]}°C)\n`;
      report += `🌤️ 氣溫: ${airTempRange[0]}-${airTempRange[1]}°C\n`;
      
      // 水質狀態評估
      const clStatus = (avgCL >= 1.0 && avgCL <= 3.0) ? '✅' : '⚠️';
      const phStatus = (avgPH >= 7.2 && avgPH <= 7.8) ? '✅' : '⚠️';
      
      report += `\n【狀況評估】\n`;
      report += `${clStatus} 氯含量 | ${phStatus} pH值\n`;
      
      // 簡化趨勢分析 (首末對比)
      if (records.length >= 2) {
        const firstRecord = records[0];
        const lastRecord = records[records.length - 1];
        const clTrend = lastRecord.cl - firstRecord.cl;
        
        report += `\n【趨勢】 ${firstRecord.time}→${lastRecord.time}\n`;
        report += `氯含量: ${clTrend > 0 ? '↗️' : clTrend < 0 ? '↘️' : '→'} ${clTrend > 0 ? '+' : ''}${clTrend.toFixed(1)} mg/L\n`;
      }
      
      // 管理建議 (簡化)
      if (clStatus === '✅' && phStatus === '✅') {
        report += `\n💚 水質良好，持續監控即可\n`;
      } else {
        report += `\n⚠️ 需要調整水質參數\n`;
      }
      
      if (avgAirTemp >= 35) {
        report += `🔥 高溫警示: ${Math.max(...records.map(r => r.airTemp))}°C\n`;
      }
      
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
          
          // 直接推送到群組（不等待互動）
          await lineService.pushMessage(groupId, report);
          
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

  /**
   * 🤖 使用 GPT 智能分析整天對話，識別並處理所有水質記錄
   */
  async processWaterQualityWithGPT(groupId: string): Promise<void> {
    try {
      console.log(`🤖 開始 GPT 智能水質分析 - 群組: ${groupId}`);
      
      // 支援的群組檢查
      const supportedGroups = ['C50c2a9623a78cc5f5e9f39557e3abfe6', 'C9b3c5dfe2e005adafd2ed914714a1930'];
      if (!supportedGroups.includes(groupId)) {
        console.log(`❌ 群組 ${groupId} 不支援水質監測`);
        return;
      }

      // 獲取今天該群組的所有對話記錄 (擴大範圍到昨天，確保不遺漏)
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 0, 0, 0); // 從昨天開始
      
      const logs = await storage.getAuditLogs(500); // 獲取更多記錄以確保完整性
      const todayMessages = logs.filter(log => 
        log.timestamp >= startOfDay &&
        log.message === '訊息已儲存' &&
        log.details &&
        typeof log.details === 'object' &&
        'groupId' in log.details &&
        (log.details as any).groupId === groupId &&
        'text' in log.details
      );

      if (todayMessages.length === 0) {
        console.log(`📭 群組 ${groupId} 今天沒有對話記錄`);
        return;
      }

      // 轉換為 IMessage 格式
      const messages: IMessage[] = todayMessages.map(log => ({
        id: log.id,
        messageId: (log.details as any).messageId || log.id,
        sourceType: 'group',
        groupId: groupId,
        userId: (log.details as any).userId || '',
        displayName: (log.details as any).displayName || '',
        type: 'text',
        text: (log.details as any).text || '',
        timestamp: log.timestamp,
        rawEvent: log.details,
        createdAt: log.timestamp
      }));

      console.log(`📊 分析 ${messages.length} 條對話記錄...`);

      // 使用 GPT 智能識別水質記錄
      const gptWaterQualityRecords = await llmService.extractWaterQualityFromMessages(messages);
      
      if (gptWaterQualityRecords.length === 0) {
        console.log('🔍 GPT 未識別到水質記錄');
        return;
      }

      console.log(`🎯 GPT 識別到 ${gptWaterQualityRecords.length} 筆水質記錄`);

      // 將 GPT 識別的記錄轉換為系統格式並保存
      for (const gptRecord of gptWaterQualityRecords) {
        const waterQualityData: WaterQualityData = {
          date: gptRecord.date,
          time: gptRecord.time,
          cl: gptRecord.cl,
          ph: gptRecord.ph,
          waterTemp: gptRecord.waterTemp,
          airTemp: gptRecord.airTemp,
          messageId: crypto.randomUUID(), // 生成新的 messageId
          userId: 'gpt-processed'
        };

        // 檢查是否已存在相同記錄（避免重複）
        const existingRecords = waterQualityMemoryStore.getTodayRecords();
        const isDuplicate = existingRecords.some(existing => 
          existing.date === waterQualityData.date &&
          existing.time === waterQualityData.time &&
          existing.cl === waterQualityData.cl &&
          existing.ph === waterQualityData.ph
        );

        if (!isDuplicate) {
          await this.saveWaterQualityRecord(waterQualityData, groupId);
          console.log(`✅ GPT 識別記錄已保存: ${gptRecord.date} ${gptRecord.time} - CL:${gptRecord.cl} PH:${gptRecord.ph} (${gptRecord.author})`);
        } else {
          console.log(`⏭️ 跳過重複記錄: ${gptRecord.date} ${gptRecord.time}`);
        }
      }

      // 生成 GPT 分析報告
      const analysisReport = await llmService.generateWaterQualityAnalysis(gptWaterQualityRecords);
      
      if (analysisReport) {
        // 發送分析報告到群組
        const reportMessage = `🤖 AI 水質智能分析報告\n\n${analysisReport}\n\n📊 已識別並處理 ${gptWaterQualityRecords.length} 筆水質記錄`;
        await lineService.sendToGroup(groupId, reportMessage);
        console.log(`📊 GPT 水質分析報告已發送到群組 ${groupId}`);
      }

      // 記錄處理結果到 audit logs
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'water_quality_gpt',
        message: 'GPT 水質智能分析完成',
        details: {
          groupId,
          messagesAnalyzed: messages.length,
          recordsFound: gptWaterQualityRecords.length,
          analysisGenerated: !!analysisReport
        }
      });

    } catch (error) {
      console.error('❌ GPT 水質分析失敗:', error);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'water_quality_gpt',
        message: 'GPT 水質智能分析失敗',
        details: { 
          groupId, 
          error: (error as Error).message 
        }
      });
    }
  }
}

export const waterQualityService = new WaterQualityService();