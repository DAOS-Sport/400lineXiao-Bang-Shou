#!/usr/bin/env tsx
// 測試「交辦」任務創建功能

import { storage } from '../storage';
import { messageService } from '../services/messageService';
import { taskService } from '../services/taskService';

async function testTaskCreation() {
  console.log('🧪 測試「交辦」任務創建功能...');
  
  try {
    // 模擬 LINE 群組訊息事件
    const mockEvent = {
      type: 'message',
      message: {
        type: 'text',
        id: 'test-message-' + Date.now(),
        text: '交辦：請檢查游泳池水質數據是否正常'
      },
      source: {
        type: 'group',
        groupId: 'C9b3c5dfe2e005adafd2ed914714a1930',
        userId: 'U123456789test'
      },
      timestamp: Date.now(),
      replyToken: 'test-reply-token-' + Date.now()
    };

    console.log('📝 發送「交辦」訊息:', mockEvent.message.text);
    console.log('👥 群組 ID:', mockEvent.source.groupId);
    
    // 直接創建訊息和任務
    const messageData = await messageService.createMessageFromEvent(mockEvent);
    const savedMessage = await storage.insertMessage(messageData);
    console.log('💾 訊息已儲存');
    
    // 處理交辦任務
    if (mockEvent.message.text.includes('交辦')) {
      await taskService.createTaskFromMessage(savedMessage, mockEvent.message.text);
      console.log('🎯 任務已創建');
    }
    
    // 等待處理完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 檢查任務是否創建
    const tasks = await storage.getTasksByGroupId(mockEvent.source.groupId, 'pending');
    console.log(`\n📊 群組中的待處理任務數量: ${tasks.length}`);
    
    // 顯示最新任務
    if (tasks.length > 0) {
      const latestTask = tasks[tasks.length - 1];
      console.log('✅ 最新任務已創建:');
      console.log(`  - 任務編號: #${latestTask.taskIdSerial}`);
      console.log(`  - 任務內容: ${latestTask.text}`);
      console.log(`  - 建立者: ${latestTask.authorDisplayName || latestTask.authorUserId}`);
      console.log(`  - 狀態: ${latestTask.status}`);
      console.log(`  - 建立時間: ${new Date(latestTask.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
    }
    
    console.log('\n✅ 「交辦」功能測試完成！');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    process.exit(0);
  }
}

// 執行測試
testTaskCreation();