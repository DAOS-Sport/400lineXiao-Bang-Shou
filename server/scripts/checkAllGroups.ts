/**
 * 檢查所有活動群組腳本
 */

import { storage } from '../storage';

async function checkAllActiveGroups() {
  console.log('🔍 檢查所有活動群組...');
  
  try {
    // 查看所有訊息記錄中的群組
    const messages = await storage.getAllMessages();
    const messageGroups = Array.from(new Set(messages.map(m => m.groupId).filter(g => g && g.startsWith('C'))));
    console.log(`📧 訊息記錄中的群組數量: ${messageGroups.length}`);
    
    // 查看所有任務記錄中的群組
    const tasks = await storage.getAllTasks();
    const taskGroups = Array.from(new Set(tasks.map(t => t.groupId)));
    console.log(`📝 任務記錄中的群組數量: ${taskGroups.length}`);
    
    // 查看所有audit log中的群組
    const auditLogs = await storage.getAllAuditLogs();
    const auditGroups = Array.from(new Set(
      auditLogs
        .map(a => a.details?.groupId)
        .filter(g => g && typeof g === 'string' && g.startsWith('C'))
    ));
    console.log(`📋 審計記錄中的群組數量: ${auditGroups.length}`);
    
    // 合併所有群組
    const allGroups = Array.from(new Set([...messageGroups, ...taskGroups, ...auditGroups]));
    console.log(`🎯 總共發現群組數量: ${allGroups.length}`);
    
    console.log('\n📊 詳細群組清單:');
    allGroups.forEach((groupId, index) => {
      const msgCount = messages.filter(m => m.groupId === groupId).length;
      const taskCount = tasks.filter(t => t.groupId === groupId).length;
      const pendingTaskCount = tasks.filter(t => t.groupId === groupId && t.status === 'pending').length;
      console.log(`${index + 1}. ${groupId.substring(0, 20)}... (訊息:${msgCount}, 任務:${taskCount}, 待辦:${pendingTaskCount})`);
    });
    
    console.log(`\n📋 總共需要發送緊急通知的群組: ${allGroups.length} 個`);
    
    return allGroups;
    
  } catch (error) {
    console.error('❌ 檢查群組失敗:', error);
    return [];
  }
}

// 直接執行並輸出結果
checkAllActiveGroups();