#!/usr/bin/env tsx
// 模擬用戶完成任務05的情況

import { taskService } from '../services/taskService';
import { storage } from '../storage';
import { lineService } from '../services/lineService';

async function simulateTaskCompletion() {
  console.log('🧪 模擬用戶完成任務05...');
  
  const groupId = 'C2dd9a5fce7c276f2cbfdd02c2342661c';
  const userId = 'U_test_user';
  const text = '任務05完成';
  
  try {
    console.log(`📝 測試文字: "${text}"`);
    
    // 測試正則表達式
    const completeTaskPattern = /^(交辦|任務)(\d+)(完成|已完成)$/i;
    console.log(`🔍 檢查完成指令: "${text}" vs 正則: ${completeTaskPattern}`);
    const match = text.match(completeTaskPattern);
    console.log(`🔍 匹配結果:`, match);
    
    if (match) {
      const taskType = match[1];
      const taskSerial = match[2].padStart(2, '0');
      console.log(`✅ 偵測到完成任務指令: ${taskType}${taskSerial}完成 來自群組 ${groupId}`);
      
      // 檢查該群組的任務
      const tasks = await storage.getTasksByGroupId(groupId, 'pending');
      const task = tasks.find(t => t.taskIdSerial === taskSerial);
      
      if (task) {
        console.log(`📋 找到任務 ${taskSerial}: ${task.text.substring(0, 50)}...`);
        
        // 完成任務
        const success = await taskService.completeTaskBySerial(groupId, taskSerial, userId);
        
        if (success) {
          console.log(`✅ 任務完成成功！`);
          
          // 生成感謝訊息
          const thankYouMessage = await taskService.generateCompletionMessage(task.text);
          console.log(`💝 感謝訊息: "${thankYouMessage}"`);
          
          console.log(`✅ ${taskType}${taskSerial}已完成！\n${thankYouMessage}`);
        } else {
          console.log('❌ 任務完成失敗');
        }
      } else {
        console.log(`❌ 找不到任務 ${taskSerial}`);
      }
    } else {
      console.log('❌ 正則表達式匹配失敗');
    }
    
  } catch (error) {
    console.error('❌ 模擬測試失敗:', error);
  } finally {
    console.log('\n✅ 模擬測試完成！');
    process.exit(0);
  }
}

simulateTaskCompletion();