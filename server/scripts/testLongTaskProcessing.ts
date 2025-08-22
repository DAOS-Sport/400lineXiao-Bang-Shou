#!/usr/bin/env tsx
// 測試長任務處理和 GPT 整理功能

import { taskService } from '../services/taskService';
import { storage } from '../storage';
import type { IMessage } from '@shared/schema';
import crypto from 'crypto';

async function testLongTaskProcessing() {
  console.log('🧪 測試長任務處理和 GPT 整理功能...');
  
  // 模擬一個長任務訊息
  const longTaskText = `交辦
8/21(四) 早班交辦

【顧客溝通/進度追蹤交接】
🔁林彥辰，發票在櫃台。
🔁李允誠網球門禁卡放POS機，已通知客人前來領取。
🔁朱和寬游泳家教已付費，發票通知客人來領取。

【團體及家教課程交接】
🔁蘇瑞竑8/21病假，找時間來填假單。
🔁簡于皓、簡于曦8/25晚上來簽折讓單，折讓單在資料夾。

【環境清潔及設備檢查】
🔁麻煩晚班到垃圾

【結帳／POS機交接】
找零金:2000
零用金:2000

【其他交接事項】
🔁清帳請依照桌面範例填寫：泳池.日期.班別.現金.承辦人
🔁客人遺失一個黃色笑臉的泳鏡，會找時間過來拿。
🔁9月試上/約課行事曆表已完成，麻煩這幾天有約課的再幫忙填上。
🚧泳卷放假單袋子。
🚧泳卷可抵水上樂園費用$70。
🚧 吉米哥可來拿監視器記憶卡。
🚧江昕芸、江品佑兒童網球課(共4小時40分鐘)未補課，將於8/25前通知家長並退費。兩人合計＄3,696`;

  try {
    // 創建模擬訊息
    const mockMessage: IMessage = {
      id: crypto.randomUUID(),
      messageId: 'test_' + Date.now(),
      userId: 'U_test_user',
      displayName: '測試用戶',
      text: longTaskText,
      timestamp: new Date(),
      sourceType: 'group',
      groupId: 'C_test_group',
      eventType: 'message',
      messageType: 'text',
      rawEvent: {}
    };

    console.log(`📝 原始任務長度: ${longTaskText.length} 字符`);
    console.log('🚀 開始處理長任務...');
    
    const startTime = Date.now();
    
    // 調用任務處理服務
    await taskService.createTaskFromMessage(mockMessage, longTaskText);
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ 處理完成，耗時: ${duration}ms`);
    
    // 檢查創建的任務
    const tasks = await storage.getTasksByGroupId('C_test_group', 'pending');
    const newTask = tasks.find(t => t.text.includes('早班') || t.text.includes('交辦'));
    
    if (newTask) {
      console.log('\n✅ 任務創建成功:');
      console.log(`📋 任務編號: ${newTask.taskIdSerial}`);
      console.log(`📝 整理後內容長度: ${newTask.text.length} 字符`);
      console.log(`📊 壓縮率: ${((longTaskText.length - newTask.text.length) / longTaskText.length * 100).toFixed(1)}%`);
      console.log('\n📄 整理後內容:');
      console.log('---');
      console.log(newTask.text);
      console.log('---');
    } else {
      console.log('❌ 未找到創建的任務，可能被重複檢測阻止');
    }
    
    // 檢查相關的 audit logs
    console.log('\n📊 檢查處理日誌...');
    const recentLogs = await storage.getAuditLogs(10);
    const taskLogs = recentLogs.filter(log => 
      log.timestamp > new Date(startTime - 1000) &&
      (log.category === 'llm' || log.message.includes('任務'))
    );
    
    console.log(`📝 找到 ${taskLogs.length} 條相關日誌:`);
    taskLogs.forEach(log => {
      console.log(`  ${log.level.toUpperCase()}: ${log.message}`);
      if (log.details) {
        const details = typeof log.details === 'string' ? log.details : JSON.stringify(log.details);
        console.log(`    詳情: ${details}`);
      }
    });
    
    console.log('\n✅ 長任務處理測試完成！');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    // 清理測試數據
    try {
      const testTasks = await storage.getTasksByGroupId('C_test_group', 'pending');
      for (const task of testTasks) {
        await storage.updateTaskStatus(task.id, 'completed', new Date());
      }
      console.log('🧹 測試數據已清理');
    } catch (error) {
      console.warn('⚠️ 清理測試數據失敗:', error);
    }
    
    process.exit(0);
  }
}

// 執行測試
testLongTaskProcessing();