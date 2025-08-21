#!/usr/bin/env tsx
// 創建測試任務資料以測試防競爭機制和明天的提醒功能

import { storage } from '../storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { tasks } from '@shared/schema';

async function createTestTasks() {
  console.log('🧪 開始創建測試任務...');
  
  try {
    // 測試群組 ID（請替換為實際的群組 ID）
    const testGroupId = 'C9b3c5dfe2e005adafd2ed914714a1930'; // 游泳池測試群組
    
    // 創建昨天的任務（明天早上會發送提醒）
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(14, 0, 0, 0); // 昨天下午2點
    
    console.log('📝 創建昨天的任務...');
    
    // 創建昨天的任務（需要手動更新 created_at）
    const task1 = await storage.insertTask({
      id: '',
      groupId: testGroupId,
      taskIdSerial: '', // 會自動產生
      authorUserId: 'U123456789abcdef',
      authorDisplayName: '測試用戶A',
      text: '測試任務1：檢查水質報告',
      status: 'pending',
      sourceMessageIds: ['test-msg-1']
    });
    
    // 更新為昨天的時間
    await db.execute(sql`
      UPDATE ${tasks} 
      SET created_at = ${yesterday}
      WHERE id = ${task1.id}
    `);
    
    const task2 = await storage.insertTask({
      id: '',
      groupId: testGroupId,
      taskIdSerial: '', // 會自動產生
      authorUserId: 'U987654321fedcba',
      authorDisplayName: '測試用戶B',
      text: '測試任務2：更新設備維護記錄',
      status: 'pending',
      sourceMessageIds: ['test-msg-2']
    });
    
    await db.execute(sql`
      UPDATE ${tasks} 
      SET created_at = ${new Date(yesterday.getTime() + 1000)}
      WHERE id = ${task2.id}
    `);
    
    const task3 = await storage.insertTask({
      id: '',
      groupId: testGroupId,
      taskIdSerial: '', // 會自動產生
      authorUserId: 'U123456789abcdef',
      authorDisplayName: '測試用戶A',
      text: '測試任務3：準備明天的會議資料',
      status: 'pending',
      sourceMessageIds: ['test-msg-3']
    });
    
    await db.execute(sql`
      UPDATE ${tasks} 
      SET created_at = ${new Date(yesterday.getTime() + 2000)}
      WHERE id = ${task3.id}
    `);
    
    const createdTasks = [task1, task2, task3];
    
    console.log('✅ 成功創建任務：');
    createdTasks.forEach(task => {
      console.log(`  - 任務 #${task.taskIdSerial}: ${task.text}`);
    });
    
    // 創建今天的任務
    const today = new Date();
    today.setHours(10, 0, 0, 0); // 今天上午10點
    
    console.log('\n📝 創建今天的任務...');
    
    const todayTask = await storage.insertTask({
      id: '',
      groupId: testGroupId,
      taskIdSerial: '', // 會自動產生
      authorUserId: 'U123456789abcdef',
      authorDisplayName: '測試用戶A',
      text: '今日任務：確認系統運作正常',
      status: 'pending',
      sourceMessageIds: ['test-msg-4']
    });
    
    // 更新為今天的時間
    await db.execute(sql`
      UPDATE ${tasks} 
      SET created_at = ${today}
      WHERE id = ${todayTask.id}
    `);
    
    console.log(`✅ 成功創建今日任務 #${todayTask.taskIdSerial}: ${todayTask.text}`);
    
    // 檢查流水號是否正確
    console.log('\n🔍 檢查流水號唯一性...');
    const allTasks = await storage.getTasksByGroupId(testGroupId);
    const serialNumbers = allTasks.map(t => t.taskIdSerial);
    const uniqueSerials = Array.from(new Set(serialNumbers));
    
    if (serialNumbers.length === uniqueSerials.length) {
      console.log('✅ 流水號唯一性檢查通過！沒有重複的流水號');
    } else {
      console.error('❌ 發現重複的流水號！');
      console.log('所有流水號:', serialNumbers);
    }
    
    console.log('\n📊 任務統計：');
    console.log(`  - 群組 ${testGroupId.substring(0, 8)}...`);
    console.log(`  - 總任務數: ${allTasks.length}`);
    console.log(`  - 待處理任務: ${allTasks.filter(t => t.status === 'pending').length}`);
    console.log(`  - 昨天任務: ${createdTasks.length}`);
    console.log(`  - 今天任務: 1`);
    
    console.log('\n✅ 測試資料創建完成！');
    console.log('💡 明天早上 06:30 將會發送第一次任務提醒');
    
  } catch (error) {
    console.error('❌ 創建測試任務失敗:', error);
  } finally {
    process.exit(0);
  }
}

// 執行測試
createTestTasks();