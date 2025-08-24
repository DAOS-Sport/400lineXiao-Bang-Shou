#!/usr/bin/env tsx
// 測試單個群組的任務提醒功能，避免 429 錯誤

import { schedulerService } from '../services/schedulerService';
import { storage } from '../storage';
import { getOneMonthRange } from '../utils/time';

async function testSingleGroupReminder() {
  console.log('🧪 測試單個群組任務提醒...');
  
  try {
    // 選擇一個有任務的群組進行測試
    const testGroupId = 'C9b3c5dfe2e005adafd2ed914714a1930';
    
    console.log(`📊 測試群組: ${testGroupId}`);
    
    // 檢查群組任務數量
    const tasks = await storage.getTasksByGroupId(testGroupId, 'pending');
    console.log(`📋 群組有 ${tasks.length} 個待處理任務`);
    
    if (tasks.length === 0) {
      console.log('⚠️ 群組沒有待處理任務，無法測試');
      return;
    }
    
    // 設定時間範圍（一個月前到現在）
    const { start: startDate, end: endDate } = getOneMonthRange();
    
    console.log('🚀 開始發送單群組任務提醒...');
    
    // 直接調用單群組處理方法
    await (schedulerService as any).processGroupDailySummaryWithSuggestions(
      testGroupId, 
      startDate, 
      endDate
    );
    
    console.log('✅ 單群組任務提醒測試完成！');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    
    // 記錄測試失敗
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'error',
      category: 'scheduler',
      message: '單群組提醒測試失敗',
      details: { error: (error as Error).message }
    });
  } finally {
    process.exit(0);
  }
}

// 執行測試
testSingleGroupReminder();