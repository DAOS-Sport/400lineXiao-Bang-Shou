/**
 * 緊急廣播腳本 - 地震後場地檢查
 * 發送緊急訊息到所有有待辦事項的群組
 */

import { storage } from '../storage';
import { lineService } from '../services/lineService';
import crypto from 'crypto';

async function emergencyEarthquakeBroadcast() {
  console.log('🚨 開始緊急地震廣播...');
  
  try {
    // 1. 找出所有有待辦事項的群組
    const allTasks = await storage.getAllTasks();
    const pendingTasks = allTasks.filter(task => task.status === 'pending');
    const groupsWithTasks = Array.from(new Set(pendingTasks.map(task => task.groupId)));
    
    console.log(`📊 發現 ${groupsWithTasks.length} 個有待辦事項的群組`);
    groupsWithTasks.forEach((groupId, index) => {
      const taskCount = pendingTasks.filter(t => t.groupId === groupId).length;
      console.log(`${index + 1}. ${groupId.substring(0, 20)}... (${taskCount} 項待辦)`);
    });

    // 2. 準備緊急訊息
    const emergencyMessage = `🚨 緊急通知 - 地震後安全檢查

剛剛發生地震
請各群組巡視完畢後回報
牆壁是否有裂痕 機房是否正常
所有場地巡視一遍後回報

請立即進行以下檢查：
✅ 建築結構 - 牆壁、天花板是否有裂痕
✅ 機房設備 - 伺服器、網路設備是否正常
✅ 安全設施 - 消防設備、緊急出口是否暢通
✅ 水電系統 - 水管、電路是否正常

檢查完畢請回報群組狀況
時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;

    // 3. 群發到所有有待辦事項的群組
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const groupId of groupsWithTasks) {
      try {
        console.log(`📤 發送緊急訊息到群組 ${groupId.substring(0, 12)}...`);
        
        await lineService.pushMessage(groupId, emergencyMessage, { maxRetries: 2 });
        results.success++;
        
        // 記錄成功發送
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'emergency_broadcast',
          message: '地震緊急廣播成功發送',
          details: {
            groupId: groupId,
            messageType: 'earthquake_safety_check',
            timestamp: new Date().toISOString()
          }
        });
        
        // 群組間延遲避免頻率限制
        if (groupsWithTasks.indexOf(groupId) < groupsWithTasks.length - 1) {
          console.log('⏳ 延遲 500ms 避免 API 限制...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error: any) {
        results.failed++;
        const errorMsg = `群組 ${groupId.substring(0, 12)}: ${error.message}`;
        results.errors.push(errorMsg);
        
        console.error(`❌ 發送失敗 - ${errorMsg}`);
        
        // 記錄失敗
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'error',
          category: 'emergency_broadcast',
          message: '地震緊急廣播發送失敗',
          details: {
            groupId: groupId,
            error: error.message,
            statusCode: error.statusCode || 0,
            timestamp: new Date().toISOString()
          }
        });
      }
    }

    // 4. 總結報告
    console.log('\n🚨 緊急地震廣播完成！');
    console.log(`✅ 成功: ${results.success} 個群組`);
    console.log(`❌ 失敗: ${results.failed} 個群組`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ 發送失敗的群組:');
      results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    // 記錄廣播總結
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'info',
      category: 'emergency_broadcast',
      message: '地震緊急廣播任務完成',
      details: {
        totalGroups: groupsWithTasks.length,
        successCount: results.success,
        failedCount: results.failed,
        broadcastType: 'earthquake_safety_check',
        timestamp: new Date().toISOString(),
        errors: results.errors
      }
    });

    process.exit(0);
    
  } catch (error) {
    console.error('❌ 緊急廣播系統錯誤:', error);
    
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'error',
      category: 'emergency_broadcast',
      message: '緊急廣播系統失敗',
      details: {
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      }
    });
    
    process.exit(1);
  }
}

// 立即執行緊急廣播
emergencyEarthquakeBroadcast();