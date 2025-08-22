import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { lineService } from "./services/lineService";
import { messageService } from "./services/messageService";
import { taskService } from "./services/taskService";
import { llmService } from "./services/llmService";
import { schedulerService } from "./services/schedulerService";
import { waterQualityService } from "./services/waterQualityService";
import { authMiddleware } from "./middleware/auth";
import { validateLineSignature } from "./middleware/lineSignature";
// import { insertMessageSchema } from "@shared/schema"; // 移除未使用的 import
import helmet from "helmet";
import rateLimit from "express-rate-limit";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log('🚀 開始註冊路由...');
  
  // 設定 trust proxy 以支援 Replit 的代理設置
  app.set('trust proxy', true);
  
  // 🔧 修復：正確處理原始 body 以支援 LINE 簽名驗證
  app.use('/webhook', express.raw({ type: 'application/json' }));
  app.use('/webhook', (req: any, res, next) => {
    try {
      req.rawBody = req.body;
      if (Buffer.isBuffer(req.body)) {
        req.body = JSON.parse(req.body.toString());
      }
      next();
    } catch (error) {
      console.error('解析 webhook body 失敗:', error);
      res.status(400).json({ error: 'Invalid JSON' });
    }
  });
  
  // **關鍵修復：統一使用 /webhook 路徑**
  
  // 全局請求日誌中間件
  app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path} - 請求到達 (${new Date().toISOString()})`);
    next();
  });
  
  // 安全中間件
  app.use(helmet());
  
  // Rate limiting（配置適用於 Replit 代理環境）
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 1000, // 最多 1000 requests per window
    message: { error: "請求過於頻繁，請稍後再試" },
    keyGenerator: () => 'global', // 使用固定 key 避免代理 IP 問題
  });
  app.use(limiter);

  // 針對 webhook 的更嚴格限制（配置適用於 Replit 代理環境）
  const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 分鐘
    max: 100, // 最多 100 requests per minute
    message: { error: "Webhook 請求過於頻繁" },
    keyGenerator: () => 'webhook', // 使用固定 key 避免代理 IP 問題
  });

  // GET / - 只回 "ok"
  console.log('🔗 註冊根路由 /');
  app.get("/", (req, res) => {
    console.log('🏠 根路由被請求');
    res.send("ok");
  });

  // GET /health - 健康檢查
  console.log('🔗 註冊 /health 路由');
  app.get("/health", async (req, res) => {
    console.log('❤️ /health 被請求');
    try {
      const { keepAliveService } = await import('./services/keepAliveService');
      const status = keepAliveService.getStatus();
      
      res.json({ 
        status: "ok",
        service: "LINE Bot Service", 
        keepAlive: status,
        uptime: `${Math.floor(process.uptime() / 60)} 分鐘`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({ 
        status: "ok",
        service: "LINE Bot Service", 
        timestamp: new Date().toISOString()
      });
    }
  });


  // POST /webhook - LINE Webhook 處理（統一路徑）
  console.log('🔗 註冊 /webhook 路由');
  app.post("/webhook", webhookLimiter, validateLineSignature, async (req, res) => {
    console.log('🎯 Webhook 請求到達!');
    try {
      // 立即回應 200 - 加速回應時間
      res.status(200).send("OK");

      // 處理事件（非同步，避免阻塞回應）
      const events = req.body.events;
      if (events && Array.isArray(events)) {
        // 🔧 並發處理多個事件，提升性能
        const eventPromises = events.map(event => 
          processWebhookEvent(event).catch(error => {
            console.error('處理單個事件失敗:', error);
          })
        );
        await Promise.allSettled(eventPromises);
      }
    } catch (error) {
      console.error("Webhook 處理錯誤:", error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'webhook',
        message: 'Webhook 處理失敗',
      });
      
      // 仍然回應 200，避免 LINE 重送
      if (!res.headersSent) {
        res.status(200).send("OK");
      }
    }
  });

  // POST /api/admin/trigger-tasks - 手動觸發任務推送
  app.post("/api/admin/trigger-tasks", authMiddleware, async (req, res) => {
    try {
      console.log('🔧 管理員手動觸發任務推送');
      await schedulerService.manualTriggerTaskSummary();
      res.json({ success: true, message: "任務推送已觸發" });
    } catch (error) {
      console.error("手動觸發任務推送失敗:", error);
      res.status(500).json({ error: "觸發失敗" });
    }
  });

  // GET /api/admin/messages - 管理後台 API
  app.get("/api/admin/messages", authMiddleware, async (req, res) => {
    try {
      const {
        q,
        start,
        end,
        sourceType,
        page = 1,
        pageSize = 50
      } = req.query;

      const filters: any = {
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string)
      };

      if (q) filters.q = q as string;
      if (start) filters.start = new Date(start as string);
      if (end) filters.end = new Date(end as string);
      if (sourceType) filters.sourceType = sourceType as string;

      const result = await storage.getMessages(filters);
      
      res.set({
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache'
      });

      res.json({
        messages: result.messages,
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.pageSize)
        }
      });
    } catch (error) {
      console.error("獲取訊息失敗:", error);
      res.status(500).json({ error: "內部伺服器錯誤" });
    }
  });

  // 水質測試API（開發用）
  app.get('/api/water-quality/test', async (req, res) => {
    try {
      const { runWaterQualityTests } = await import('./test/waterQualityTest');
      
      // 運行測試並捕獲輸出
      const originalLog = console.log;
      let output = '';
      console.log = (...args) => {
        output += args.join(' ') + '\n';
        originalLog(...args);
      };
      
      await runWaterQualityTests();
      
      // 恢復原始 console.log
      console.log = originalLog;
      
      res.json({ 
        success: true, 
        message: '水質系統測試完成',
        output: output
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // 獲取今日水質報告API
  app.get('/api/water-quality/report', async (req, res) => {
    try {
      const report = await waterQualityService.generateDailyWaterQualityReport();
      res.json({ 
        success: true, 
        report: report
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // 啟動排程服務
  schedulerService.start();

  const httpServer = createServer(app);
  console.log('✅ 路由註冊完成，所有路由已就緒');
  return httpServer;
}

// 內存去重機制
const processedEvents = new Set<string>();

// 處理 Webhook 事件
async function processWebhookEvent(event: any) {
  try {
    // 只處理 message 類型事件
    if (event.type !== 'message') {
      return;
    }

    // 🔧 增強去重機制 - 使用內存快取
    const eventKey = `${event.message.id}_${event.timestamp}`;
    if (processedEvents.has(eventKey)) {
      console.log('⚡ 已處理過的事件，跳過重複處理');
      return;
    }
    processedEvents.add(eventKey);
    
    // 限制內存使用，只保留最近1000個事件
    if (processedEvents.size > 1000) {
      const firstKey = processedEvents.values().next().value;
      processedEvents.delete(firstKey || '');
    }

    // 檢查是否已處理過（資料庫去重）
    const existingMessage = await storage.getMessageByMessageId(event.message.id || '');
    if (existingMessage) {
      return;
    }

    // 儲存訊息（詳細日誌錯誤處理）
    let savedMessage;
    try {
      const messageData = await messageService.createMessageFromEvent(event);
      savedMessage = await storage.insertMessage(messageData);
      console.log(`💾 訊息已儲存: ${event.message.text?.substring(0, 30)}...`);
    } catch (error) {
      console.error('❌ 訊息儲存失敗，但繼續處理指令:', error);
      savedMessage = null;
    }

    // 處理指令和任務檢測
    if (event.message.type === 'text' && event.message.text) {
      const text = event.message.text.trim();
      const source = event.source;
      console.log(`📝 處理文字訊息: "${text}" 來自 ${source.type} ${source.groupId || source.userId}`);
      
      // 1. ID 查詢指令（任何人可用，不分大小寫）
      if (text.toLowerCase() === 'id') {
        await handleIdCommand(event);
        return;
      }

      // 2. 交辦偵測（所有群組皆可使用）
      if (text.includes('交辦') && source.type === 'group' && savedMessage) {
        console.log(`🎯 偵測到交辦任務: "${text}" 來自群組 ${source.groupId}`);
        await taskService.createTaskFromMessage(savedMessage, text);
      }

      // 2.1 任務完成標記（所有群組皆可使用）- 支持多種格式
      if (source.type === 'group') {
        // 支持三種格式：交辦01完成、任務01完成、任務01已完成
        const completeTaskPattern = /^(交辦|任務)(\d+)(完成|已完成)$/i;
        const match = text.match(completeTaskPattern);
        if (match) {
          const taskType = match[1]; // 交辦 或 任務
          const taskSerial = match[2].padStart(2, '0'); // 確保是兩位數格式 01, 02...
          console.log(`✅ 偵測到完成任務指令: ${taskType}${taskSerial}完成 來自群組 ${source.groupId}`);
          
          try {
            // 先獲取任務內容以便生成感謝訊息
            const tasks = await storage.getTasksByGroupId(source.groupId, 'pending');
            const task = tasks.find(t => t.taskIdSerial === taskSerial);
            
            if (task) {
              console.log(`📋 找到任務 ${taskSerial}: ${task.text.substring(0, 50)}...`);
              
              const success = await taskService.completeTaskBySerial(source.groupId, taskSerial, source.userId);
              if (success) {
                // 生成 GPT 溫馨感謝訊息
                console.log(`💝 開始生成感謝訊息...`);
                const thankYouMessage = await taskService.generateCompletionMessage(task.text);
                console.log(`💝 感謝訊息生成成功: "${thankYouMessage}"`);
                
                const replyText = `✅ ${taskType}${taskSerial}已完成！\n${thankYouMessage}`;
                console.log(`📤 準備回覆: "${replyText}"`);
                
                try {
                  await lineService.replyMessage(event.replyToken, replyText);
                  console.log(`✅ 回覆訊息已發送`);
                } catch (replyError) {
                  console.error(`❌ 回覆訊息發送失敗:`, replyError);
                  // 嘗試推送而非回覆
                  try {
                    await lineService.pushMessage(source.groupId, replyText);
                    console.log(`✅ 改用推送方式發送完成訊息`);
                  } catch (pushError) {
                    console.error(`❌ 推送也失敗:`, pushError);
                  }
                }
                
                // 記錄成功完成
                await storage.insertAuditLog({
                  id: crypto.randomUUID(),
                  level: 'info',
                  category: 'task',
                  message: '任務完成回覆已發送',
                  details: {
                    groupId: source.groupId,
                    taskSerial,
                    userId: source.userId,
                    replyText,
                    thankYouMessage
                  }
                });
              } else {
                const errorText = `❌ 找不到${taskType}${taskSerial}或該任務已完成`;
                console.log(`📤 回覆錯誤訊息: "${errorText}"`);
                await lineService.replyMessage(event.replyToken, errorText);
              }
            } else {
              const notFoundText = `❌ 找不到${taskType}${taskSerial}或該任務已完成`;
              console.log(`📤 回覆未找到訊息: "${notFoundText}"`);
              try {
                await lineService.replyMessage(event.replyToken, notFoundText);
                console.log(`✅ 未找到任務回覆已發送`);
              } catch (replyError) {
                console.error(`❌ 未找到任務回覆發送失敗:`, replyError);
                // 嘗試推送而非回覆
                try {
                  await lineService.pushMessage(source.groupId, notFoundText);
                  console.log(`✅ 改用推送方式發送未找到任務訊息`);
                } catch (pushError) {
                  console.error(`❌ 推送也失敗:`, pushError);
                }
              }
            }
          } catch (error) {
            console.error(`❌ 處理任務完成失敗:`, error);
            try {
              await lineService.replyMessage(event.replyToken, `❌ 處理${taskType}${taskSerial}完成時發生錯誤`);
            } catch (replyError) {
              console.error(`❌ 回覆錯誤訊息也失敗:`, replyError);
            }
          }
          return; // 處理完成後直接返回，避免繼續處理其他邏輯
        }
      }

      // 3. 管理員指令
      const isAdmin = await storage.isAdmin(source.userId);
      if (isAdmin) {
        await handleAdminCommands(event, text);
      } else {
        // 檢查是否為管理員專用指令
        if (text.match(/^(查詢代辦事項|查詢近期代辦事項|編號\d+已完成)$/)) {
          await lineService.replyMessage(event.replyToken, "此指令需要管理員權限。");
        }
      }

      // 4. 檢查待發送的群組訊息
      if (source.type === 'group' && source.groupId) {
        console.log(`🔍 檢查群組 ${source.groupId} 是否有待發送訊息...`);
        await lineService.checkAndSendPendingMessages(source.groupId, event.replyToken);
      }

      // 5. 水質監控（多群組支援）
      const waterQualityGroups = ['C50c2a9623a78cc5f5e9f39557e3abfe6', 'C9b3c5dfe2e005adafd2ed914714a1930'];
      if (source.type === 'group' && waterQualityGroups.includes(source.groupId)) {
        await waterQualityService.handleWaterQualityMessage(text, event.message.id, source.userId, source.groupId);
      }

      // 5. 駿斯小助理記錄功能（僅限授權群組）
      const assistantTriggers = ['小助理請紀錄', '小助理請記錄'];
      const isAssistantCommand = assistantTriggers.includes(text);
      console.log(`🔍 檢查是否為小助理指令: "${text}" 是否符合 ${assistantTriggers.join('或')} = ${isAssistantCommand}, 群組類型: ${source.type}`);
      if (isAssistantCommand && source.type === 'group') {
        console.log(`🤖 偵測到小助理指令來自群組 ${source.groupId}`);
        await handleJunsiAssistantExtraction(event);
      }
    }

  } catch (error) {
    console.error("處理事件失敗:", error);
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'error',
      category: 'webhook',
      message: '事件處理失敗',
      details: { error: (error as Error).message, event }
    });
  }
}

// 處理 ID 查詢指令
async function handleIdCommand(event: any) {
  const source = event.source;
  let replyText = '';

  if (source.type === 'user') {
    replyText = `🆔 你的 userId：${source.userId}`;
  } else if (source.type === 'group') {
    replyText = `🆔 groupId：${source.groupId}`;
  } else if (source.type === 'room') {
    replyText = `🆔 roomId：${source.roomId}`;
  }

  await lineService.replyMessage(event.replyToken, replyText);
}

// 處理管理員指令
async function handleAdminCommands(event: any, text: string) {
  const source = event.source;
  
  if (text === '查詢代辦事項') {
    if (source.type !== 'group') {
      await lineService.replyMessage(event.replyToken, "此指令僅可在群組中使用。");
      return;
    }
    
    console.log(`🔍 管理員查詢代辦事項 - 群組ID: ${source.groupId}`);
    const openTasks = await storage.getTasksByGroupId(source.groupId, 'pending');
    console.log(`🔍 找到待辦任務數量: ${openTasks.length}`, openTasks.map(t => `${t.taskIdSerial}: ${t.text.substring(0, 30)}`));
    
    if (openTasks.length === 0) {
      await lineService.replyMessage(event.replyToken, "📌 本群未完成代辦\n目前沒有未完成的任務。");
    } else {
      const taskList = openTasks.map(task => `${task.taskIdSerial}. ${task.text}`).join('\n');
      await lineService.replyMessage(event.replyToken, `📌 本群未完成代辦\n${taskList}`);
    }
  }
  
  else if (text === '查詢近期代辦事項') {
    if (source.type !== 'group') {
      await lineService.replyMessage(event.replyToken, "此指令僅可在群組中使用。");
      return;
    }
    
    const daysAgo = parseInt(process.env.RECENT_DAYS || '7');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);
    
    const recentTasks = await storage.getTasksCreatedBetween(source.groupId, startDate, new Date(), 'pending');
    if (recentTasks.length === 0) {
      await lineService.replyMessage(event.replyToken, `📌 近 ${daysAgo} 日代辦事項\n目前沒有未完成的任務。`);
    } else {
      const taskList = recentTasks.map(task => `${task.taskIdSerial}. ${task.text}`).join('\n');
      await lineService.replyMessage(event.replyToken, `📌 近 ${daysAgo} 日代辦事項\n${taskList}`);
    }
  }
  
  else if (text === '手動備份') {
    await handleManualBackup(event);
  }
  
  else if (text === '查詢備份歷史') {
    await handleBackupHistory(event);
  }
  
  else if (text.match(/^編號(\d{2})已完成$/)) {
    if (source.type !== 'group') {
      await lineService.replyMessage(event.replyToken, "此指令僅可在群組中使用。");
      return;
    }
    
    const match = text.match(/^編號(\d{2})已完成$/);
    const taskSerial = match![1];
    
    const task = await storage.getTaskByGroupAndSerial(source.groupId, taskSerial);
    if (!task || task.status === 'completed') {
      await lineService.replyMessage(event.replyToken, `找不到編號 ${taskSerial} 的未完成任務。`);
    } else {
      await storage.updateTaskStatus(task.id, 'completed', new Date());
      const completedTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      await lineService.replyMessage(event.replyToken, `✅ 已結案：${taskSerial}. ${task.text}（完成時間 ${completedTime}）`);
    }
  }
}

// 處理駿斯小助理任務萃取（需要群組授權）
async function handleJunsiAssistantExtraction(event: any) {
  try {
    const source = event.source;
    console.log(`🔍 檢查群組 ${source.groupId} 的授權狀態...`);
    
    // 檢查群組授權
    const isAuthorized = await storage.isGroupAuthorized(source.groupId);
    console.log(`🔐 群組 ${source.groupId} 授權狀態: ${isAuthorized}`);
    
    if (!isAuthorized) {
      console.log(`❌ 群組 ${source.groupId} 未授權，拒絕使用小助理功能`);
      await lineService.replyMessage(event.replyToken, "此群組未授權使用駿斯小助理功能，請聯繫系統管理員。");
      return;
    }
    
    console.log(`✅ 群組 ${source.groupId} 已授權，開始處理小助理請紀錄功能`);
    

    const recentMessages = await storage.getRecentMessages(source.groupId, 20);
    
    if (recentMessages.length === 0) {
      await lineService.replyMessage(event.replyToken, "群組中暫無足夠的訊息記錄。");
      return;
    }

    const extractedTasks = await llmService.extractTasksFromMessages(recentMessages);
    
    if (extractedTasks.length === 0) {
      await lineService.replyMessage(event.replyToken, "駿斯小助理從最近的對話中沒有找到可執行的任務。");
      return;
    }

    // 批量建立任務
    let createdCount = 0;
    for (const taskText of extractedTasks) {
      const taskSerial = await storage.getNextTaskSerial(source.groupId);
      await storage.insertTask({
        id: crypto.randomUUID(),
        groupId: source.groupId,
        taskIdSerial: taskSerial,
        text: taskText,
        status: 'pending',
        authorUserId: source.userId,
        sourceMessageIds: recentMessages.slice(0, 5).map(m => m.messageId) // 最近 5 則為主要參考
      });
      createdCount++;
    }

    await lineService.replyMessage(
      event.replyToken, 
      `✅ 駿斯小助理已從最近對話中萃取並建立 ${createdCount} 個任務。\n使用「查詢代辦事項」查看詳細列表。`
    );

  } catch (error) {
    console.error("駿斯小助理任務萃取失敗:", error);
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'error',
      category: 'llm',
      message: '駿斯小助理任務萃取失敗',
      details: { error: (error as Error).message, groupId: event.source.groupId }
    });
    
    await lineService.replyMessage(event.replyToken, "駿斯小助理暫時無法使用，請稍後再試。");
  }
}

// 處理手動備份指令
async function handleManualBackup(event: any) {
  try {
    const source = event.source;
    
    console.log('🗄️ 管理員觸發手動備份');
    
    // 執行群組備份（最近7天）
    const { simpleBackupService } = await import('./services/simpleBackupService');
    let success = false;
    
    if (source.type === 'group') {
      success = await simpleBackupService.backupGroupMessages(source.groupId, 7);
      if (success) {
        await lineService.replyMessage(event.replyToken, "✅ 本群組訊息備份完成\n已備份最近7天的對話記錄");
      } else {
        await lineService.replyMessage(event.replyToken, "❌ 備份過程中發生錯誤，請查看系統日誌");
      }
    } else {
      // 全系統備份
      success = await simpleBackupService.performDailyBackup();
      if (success) {
        await lineService.replyMessage(event.replyToken, "✅ 系統訊息備份完成\n已備份昨天的所有對話記錄");
      } else {
        await lineService.replyMessage(event.replyToken, "❌ 備份過程中發生錯誤，請查看系統日誌");
      }
    }
    
  } catch (error) {
    console.error("手動備份失敗:", error);
    await lineService.replyMessage(event.replyToken, "❌ 備份功能執行失敗");
  }
}

// 處理備份歷史查詢
async function handleBackupHistory(event: any) {
  try {
    console.log('📋 管理員查詢備份歷史');
    
    const { simpleBackupService } = await import('./services/simpleBackupService');
    const backupHistory = await simpleBackupService.getBackupHistory(5);
    
    if (backupHistory.length === 0) {
      await lineService.replyMessage(event.replyToken, "📋 備份歷史\n目前沒有備份記錄");
      return;
    }
    
    const historyText = backupHistory.map(backup => {
      const date = backup.backupDate;
      const type = backup.backupType;
      const count = backup.totalMessages;
      const group = backup.groupId ? `群組 ${backup.groupId.substring(0, 8)}...` : '全系統';
      return `${date} ${type} (${count}條) ${group}`;
    }).join('\n');
    
    await lineService.replyMessage(event.replyToken, `📋 備份歷史（最近5次）\n${historyText}`);
    
  } catch (error) {
    console.error("查詢備份歷史失敗:", error);
    await lineService.replyMessage(event.replyToken, "❌ 查詢備份歷史失敗");
  }
}
