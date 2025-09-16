import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { lineService } from "./services/lineService";
import { messageService } from "./services/messageService";
import { taskService } from "./services/taskService";
import { llmService } from "./services/llmService";
import { schedulerService } from "./services/schedulerService";
import { waterQualityService } from "./services/waterQualityService";
import { weatherService } from "./services/weatherService";
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

  // 靜態資產服務（支援LINE Video Message的HTTPS URL需求）
  app.use('/attached_assets', express.static('../attached_assets', {
    setHeaders: (res, path) => {
      if (path.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
      } else if (path.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      }
    }
  }));
  console.log('📁 靜態資產服務已設置：/attached_assets');

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
        error: (error as Error).message 
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
        error: (error as Error).message 
      });
    }
  });

  // 資料庫查看介面 - 任務
  app.get('/api/admin/tasks', async (req, res) => {
    try {
      const { groupId, status, limit = 50 } = req.query;
      let tasks;
      
      if (groupId) {
        tasks = await storage.getTasksByGroupId(groupId as string, status as string);
      } else {
        tasks = await storage.getAllTasks();
      }
      
      // 限制返回數量
      const limitedTasks = tasks.slice(0, parseInt(limit as string));
      
      res.json({
        success: true,
        total: tasks.length,
        displayed: limitedTasks.length,
        tasks: limitedTasks.map((task: any) => ({
          id: task.id,
          serial: task.taskIdSerial,
          text: task.text,
          status: task.status,
          groupId: task.groupId,
          author: task.authorDisplayName,
          createdAt: task.createdAt,
          completedAt: task.completedAt
        }))
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: (error as Error).message 
      });
    }
  });

  // 資料庫查看介面 - 審計日誌
  app.get('/api/admin/audit-logs', async (req, res) => {
    try {
      const { category, limit = 100 } = req.query;
      const logs = await storage.getAuditLogs(parseInt(limit as string));
      
      let filteredLogs = logs;
      if (category) {
        filteredLogs = logs.filter(log => log.category === category);
      }
      
      res.json({
        success: true,
        total: filteredLogs.length,
        logs: filteredLogs.map(log => ({
          id: log.id,
          level: log.level,
          category: log.category,
          message: log.message,
          timestamp: log.timestamp,
          details: log.details
        }))
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: (error as Error).message 
      });
    }
  });

  // 簡單查看介面 - API 版本（無需 JavaScript）
  app.get('/admin', async (req, res) => {
    try {
      // 獲取最新的任務和日誌
      const recentTasks = await storage.getAllTasks();
      const recentLogs = await storage.getAuditLogs(20);
      
      const tasksData = recentTasks.slice(0, 10).map(task => ({
        序號: task.taskIdSerial,
        內容: task.text.substring(0, 50) + (task.text.length > 50 ? '...' : ''),
        狀態: task.status === 'pending' ? '進行中' : '已完成',
        群組: task.groupId.substring(0, 20) + '...',
        建立時間: new Date(task.createdAt).toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})
      }));

      const logsData = recentLogs.slice(0, 10).map(log => ({
        類別: log.category,
        等級: log.level,
        訊息: log.message.substring(0, 60) + (log.message.length > 60 ? '...' : ''),
        時間: new Date(log.timestamp).toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})
      }));

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>LINE 小秘書 - 後台管理</title>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; }
            h1 { color: #333; text-align: center; }
            h3 { color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #007bff; color: white; }
            tr:hover { background-color: #f8f9fa; }
            .status-pending { color: #dc3545; font-weight: bold; }
            .status-completed { color: #28a745; font-weight: bold; }
            .refresh-btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; margin: 10px 0; }
            .refresh-btn:hover { background: #0056b3; }
            .api-links { margin: 20px 0; }
            .api-links a { display: inline-block; margin: 5px 10px; padding: 8px 15px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; }
            .api-links a:hover { background: #218838; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🤖 LINE 小秘書 - 後台管理系統</h1>
            
            <div class="api-links">
              <strong>API 連結：</strong>
              <a href="/admin">🔄 重新載入</a>
              <a href="/api/admin/tasks">📋 所有任務 JSON</a>
              <a href="/api/admin/audit-logs">📊 審計日誌 JSON</a>
              <a href="/api/water-quality/report">🏊‍♂️ 水質報告 JSON</a>
            </div>

            <div class="section">
              <h3>📋 最新交辦任務 (最近 10 筆)</h3>
              <table>
                <thead>
                  <tr>
                    <th>序號</th>
                    <th>任務內容</th>
                    <th>狀態</th>
                    <th>群組 ID</th>
                    <th>建立時間</th>
                  </tr>
                </thead>
                <tbody>
                  ${tasksData.map(task => `
                    <tr>
                      <td>${task.序號}</td>
                      <td>${task.內容}</td>
                      <td class="status-${task.狀態 === '進行中' ? 'pending' : 'completed'}">${task.狀態}</td>
                      <td style="font-family: monospace; font-size: 12px;">${task.群組}</td>
                      <td>${task.建立時間}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <p><strong>總任務數：</strong>${recentTasks.length} 筆</p>
            </div>

            <div class="section">
              <h3>📊 系統日誌 (最近 10 筆)</h3>
              <table>
                <thead>
                  <tr>
                    <th>類別</th>
                    <th>等級</th>
                    <th>訊息內容</th>
                    <th>記錄時間</th>
                  </tr>
                </thead>
                <tbody>
                  ${logsData.map(log => `
                    <tr>
                      <td><span style="background: #e9ecef; padding: 4px 8px; border-radius: 3px; font-size: 12px;">${log.類別}</span></td>
                      <td><span style="background: ${log.等級 === 'error' ? '#dc3545' : log.等級 === 'warning' ? '#ffc107' : '#28a745'}; color: white; padding: 4px 8px; border-radius: 3px; font-size: 12px;">${log.等級}</span></td>
                      <td>${log.訊息}</td>
                      <td>${log.時間}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <p><strong>總日誌數：</strong>${recentLogs.length} 筆</p>
            </div>

            <div class="section">
              <h3>🏊‍♂️ 快速操作</h3>
              <p><strong>系統狀態：</strong> 🟢 正常運行</p>
              <p><strong>最後更新：</strong> ${new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}</p>
              <p><strong>監控群組：</strong> 13 個活躍群組</p>
              <p><strong>服務功能：</strong> 任務管理 | 水質監控 | 風力預報 | 訊息備份</p>
            </div>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send(`
        <h1>系統錯誤</h1>
        <p>無法載入後台資料：${(error as Error).message}</p>
        <a href="/admin">重試</a>
      `);
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
      const idQueryCommands = ['id', '查詢員工編號'];
      if (idQueryCommands.includes(text.toLowerCase())) {
        await handleIdCommand(event);
        return;
      }

      // 2. 交辦偵測（所有群組皆可使用）- 先檢查是否為完成指令，避免誤判
      if (source.type === 'group' && savedMessage) {
        // 檢查是否為完成指令，如果是則跳過交辦偵測
        const completeTaskPattern = /^(交辦|任務)(\d+)(完成|已完成)$/i;
        const isCompleteCommand = completeTaskPattern.test(text);
        
        // 只有在不是完成指令的情況下，才進行交辦偵測
        if (!isCompleteCommand && text.includes('交辦')) {
          console.log(`🎯 偵測到交辦任務: "${text}" 來自群組 ${source.groupId}`);
          try {
            console.log(`🔍 DEBUG: 準備創建任務，replyToken: ${event.replyToken?.substring(0, 20)}...`);
            const taskResult = await taskService.createTaskFromMessage(savedMessage, text);
            console.log(`🎯 任務創建結果:`, taskResult);
            
            // 如果成功創建任務，自動回覆確認
            if (taskResult) {
              const confirmationText = `✅ 已登記交辦任務-${taskResult.taskSerial}`;
              console.log(`📤 準備回覆任務創建確認: "${confirmationText}"`);
              
              try {
                await lineService.replyMessage(event.replyToken, confirmationText);
                console.log(`✅ 任務創建確認已發送`);
              } catch (replyError) {
                console.error(`❌ 回覆任務創建確認失敗:`, replyError);
                try {
                  await lineService.pushMessage(source.groupId, confirmationText);
                  console.log(`✅ 改用推送方式發送任務創建確認到群組 ${source.groupId}`);
                } catch (pushError) {
                  console.error(`❌ 推送任務創建確認也失敗:`, pushError);
                }
              }
            } else {
              console.log(`⚠️ 任務創建結果為 null，可能是重複任務或創建失敗`);
            }
          } catch (taskError) {
            console.error(`❌ 任務創建過程異常:`, taskError);
          }
        }
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
          console.log(`🔍 DEBUG: 檢查任務 ${taskSerial} 在群組 ${source.groupId} 中的狀態`);
          
          try {
            // 先檢查任務是否存在（任何狀態）
            const allTasks = await storage.getTasksByGroupId(source.groupId); // 不指定狀態，獲取所有任務
            console.log(`🔍 DEBUG: 群組 ${source.groupId} 中共有 ${allTasks.length} 個任務`);
            const existingTask = allTasks.find(t => t.taskIdSerial === taskSerial);
            
            if (existingTask && existingTask.status === 'completed') {
              // 任務已經完成
              const alreadyCompletedText = `✅ ${taskType}${taskSerial}已經完成了！`;
              console.log(`📤 回覆已完成訊息: "${alreadyCompletedText}"`);
              try {
                await lineService.replyMessage(event.replyToken, alreadyCompletedText);
                console.log(`✅ 已完成提醒發送成功`);
              } catch (replyError) {
                console.error(`❌ 回覆失敗:`, replyError);
                try {
                  console.log(`🔍 DEBUG: 準備推送到群組 ${source.groupId}: "${alreadyCompletedText}"`);
                  await lineService.pushMessage(source.groupId, alreadyCompletedText);
                  console.log(`✅ 改用推送方式發送已完成提醒到群組 ${source.groupId}`);
                } catch (pushError) {
                  console.error(`❌ 推送到群組 ${source.groupId} 也失敗:`, pushError);
                }
              }
              return;
            } else if (existingTask && existingTask.status === 'pending') {
              // 任務存在且待完成
              console.log(`📋 找到任務 ${taskSerial}: ${existingTask.text.substring(0, 50)}...`);
              
              const success = await taskService.completeTaskBySerial(source.groupId, taskSerial, source.userId);
              if (success) {
                // 生成 GPT 溫馨感謝訊息
                console.log(`💝 開始生成感謝訊息...`);
                const thankYouMessage = await taskService.generateCompletionMessage(existingTask.text);
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
                    console.log(`🔍 DEBUG: 準備推送任務完成訊息到群組 ${source.groupId}: "${replyText.substring(0, 50)}..."`);
                    await lineService.pushMessage(source.groupId, replyText);
                    console.log(`✅ 改用推送方式發送完成訊息到群組 ${source.groupId}`);
                  } catch (pushError) {
                    console.error(`❌ 推送到群組 ${source.groupId} 也失敗:`, pushError);
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

      // 5. 天氣查詢功能（特定群組）
      if (source.type === 'group' && source.groupId === 'C50c2a9623a78cc5f5e9f39557e3abfe6' && text.trim() === '天氣') {
        console.log(`🌤️ 偵測到天氣查詢請求來自群組 ${source.groupId}`);
        try {
          // 獲取天氣預報數據
          const forecasts = await weatherService.getHsinchuWeatherForecast();
          
          // 使用詳細的室外游泳池天氣預報（12小時）
          const weatherReply = weatherService.formatDetailedSwimmingPoolForecast(forecasts);
          
          console.log(`📤 準備回覆詳細天氣資訊: "${weatherReply.substring(0, 100)}..."`);
          
          try {
            await lineService.replyMessage(event.replyToken, weatherReply);
            console.log(`✅ 詳細天氣預報已發送`);
            
            // 記錄天氣查詢
            await storage.insertAuditLog({
              id: crypto.randomUUID(),
              level: 'info',
              category: 'weather',
              message: '室外游泳池天氣查詢已回覆',
              details: {
                groupId: source.groupId,
                userId: source.userId,
                coordinates: '24.778126805320703, 121.01043570614455',
                forecastPeriods: forecasts.length,
                features: ['雷電風險分析', '安全時段建議', '12小時預報']
              }
            });
            
          } catch (replyError) {
            console.error(`❌ 回覆天氣預報失敗:`, replyError);
            try {
              await lineService.pushMessage(source.groupId, weatherReply);
              console.log(`✅ 改用推送方式發送天氣預報`);
            } catch (pushError) {
              console.error(`❌ 推送天氣預報也失敗:`, pushError);
            }
          }
          if (forecasts.length === 0) {
            const errorReply = '❌ 無法取得天氣預報資料，請稍後再試';
            await lineService.replyMessage(event.replyToken, errorReply);
          }
        } catch (error) {
          console.error(`❌ 處理天氣查詢失敗:`, error);
          const errorReply = '❌ 天氣查詢服務暫時無法使用，請稍後再試';
          try {
            await lineService.replyMessage(event.replyToken, errorReply);
          } catch (replyError) {
            console.error(`❌ 回覆天氣錯誤訊息失敗:`, replyError);
          }
        }
        return; // 處理完天氣查詢後直接返回
      }

      // 6. 水質監控（多群組支援）
      const waterQualityGroups = ['C50c2a9623a78cc5f5e9f39557e3abfe6', 'C9b3c5dfe2e005adafd2ed914714a1930'];
      if (source.type === 'group' && waterQualityGroups.includes(source.groupId)) {
        await waterQualityService.handleWaterQualityMessage(text, event.message.id, source.userId, source.groupId);
      }

      // 7. 駿斯小助理記錄功能（僅限授權群組）
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

  if (source.type === 'user') {
    // 私人對話：實現Video Loading動畫查詢反饋
    try {
      // 檢查是否有可用的loading視頻URL
      const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
        `https://${process.env.REPLIT_DEV_DOMAIN}` : 
        `http://localhost:5000`;
      
      // 暫時使用靜態圖片URL作為預覽圖片（等待MP4視頻文件）
      const previewImageUrl = `${baseUrl}/attached_assets/generated_images/Loading_animation_with_cute_animal_01ea528a.png`;
      
      // TODO: 需要真實的MP4視頻文件URL
      const loadingVideoUrl = `${baseUrl}/attached_assets/loading_query_animation.mp4`; // 這個文件目前不存在
      
      console.log('🔍 開始查詢員工編號，用戶:', source.userId);
      console.log('🎬 準備發送loading動畫視頻...');
      
      try {
        // 1. 嘗試發送loading視頻動畫（如果MP4文件存在）
        await lineService.replyVideoMessage(event.replyToken, loadingVideoUrl, previewImageUrl);
        console.log('✅ 成功發送loading視頻動畫');
      } catch (videoError: any) {
        console.log('⚠️ 視頻發送失敗，回退到文字動畫模式:', videoError.message);
        // 回退到原始的文字動畫方案
        await lineService.replyMessage(event.replyToken, '查詢中🔴🟡🟢');
      }
      
      // 2. 啟動進度更新和實際查詢
      startEnhancedQueryProgress(source.userId);
      
      let employeeId: string | null = null;
      
      try {
        // 先導入 RAGIC 服務（動態導入避免循環依賴）
        const { ragicService } = await import('./services/ragicService');
        
        // 查詢員工編號
        employeeId = await ragicService.getEmployeeByLineId(source.userId);
      } finally {
        // 確保進度更新被清除（故障安全）
        clearEnhancedQueryProgress(source.userId);
      }
      
      // 3. 推送最終查詢結果
      const resultMessage = `✅ 查詢完成\n\n系統識別碼: ${source.userId}\n員工編號: ${employeeId || '查無資料'}`;
      
      await lineService.pushMessage(source.userId, resultMessage);
      
      console.log(`✅ ID 查詢完成，結果: ${employeeId || '查無資料'}`);
      
    } catch (error) {
      console.error('❌ 查詢員工編號失敗:', error);
      // 停止進度更新
      clearEnhancedQueryProgress(source.userId);
      // 推送錯誤結果
      const errorMessage = `❌ 查詢失敗\n\n系統識別碼: ${source.userId}\n員工編號: 查無資料\n\n請稍後再試或聯繫系統管理員`;
      await lineService.pushMessage(source.userId, errorMessage);
    }
  } else if (source.type === 'group') {
    // 群組對話：直接回覆群組 ID
    const replyText = `🆔 groupId：${source.groupId}`;
    await lineService.replyMessage(event.replyToken, replyText);
  } else if (source.type === 'room') {
    // 房間對話：直接回覆房間 ID
    const replyText = `🆔 roomId：${source.roomId}`;
    await lineService.replyMessage(event.replyToken, replyText);
  }
}

// 增強查詢進度管理 - 支援多用戶並發
const userProgressUpdates = new Map<string, NodeJS.Timeout>();
const progressStartTimes = new Map<string, number>();

// 舊版動畫功能保留（向後兼容）
const userAnimations = new Map<string, NodeJS.Timeout>();
const animationStartTimes = new Map<string, number>();

// 新增強查詢進度更新（配合video message使用）
async function startEnhancedQueryProgress(userId: string) {
  // 清除該用戶的舊進度更新（防重複）
  clearEnhancedQueryProgress(userId);
  
  // 進度提示序列
  const progressMessages = [
    '查詢中.',
    '查詢中..',
    '查詢中...',
    '正在查詢員工資料.',
    '正在查詢員工資料..',
    '正在查詢員工資料...',
    '即將完成查詢...'
  ];
  
  let currentIndex = 0;
  let updateCount = 0;
  const maxUpdates = 8; // 最多更新8次
  const maxDuration = 20000; // 最多20秒
  
  progressStartTimes.set(userId, Date.now());
  
  // 每3秒更新一次進度狀態
  const interval = setInterval(async () => {
    currentIndex = currentIndex % progressMessages.length;
    updateCount++;
    
    // 檢查是否超過最大更新次數或時間限制
    const elapsed = Date.now() - (progressStartTimes.get(userId) || 0);
    if (updateCount >= maxUpdates || elapsed >= maxDuration) {
      console.log(`⏰ 進度更新自動停止 - 用戶: ${userId}, 更新次數: ${updateCount}, 經過時間: ${elapsed}ms`);
      clearEnhancedQueryProgress(userId);
      return;
    }
    
    try {
      await lineService.pushMessage(userId, progressMessages[currentIndex]);
      console.log(`📊 進度更新 ${updateCount}: ${progressMessages[currentIndex]}`);
    } catch (error) {
      console.error('❌ 進度更新失敗:', error);
      clearEnhancedQueryProgress(userId);
    }
    
    currentIndex++;
  }, 3000); // 3秒間隔，比原來的動畫慢一些
  
  userProgressUpdates.set(userId, interval);
  console.log(`🎬 啟動增強查詢進度更新 - 用戶: ${userId}`);
}

// 清除增強查詢進度更新
function clearEnhancedQueryProgress(userId?: string) {
  if (userId) {
    // 清除特定用戶的進度更新
    const interval = userProgressUpdates.get(userId);
    if (interval) {
      clearInterval(interval);
      userProgressUpdates.delete(userId);
      progressStartTimes.delete(userId);
      console.log(`🛑 清除增強查詢進度更新 - 用戶: ${userId}`);
    }
  } else {
    // 清除所有進度更新
    userProgressUpdates.forEach((interval, uid) => {
      clearInterval(interval);
      console.log(`🛑 清除增強查詢進度更新 - 用戶: ${uid}`);
    });
    userProgressUpdates.clear();
    progressStartTimes.clear();
  }
}

// 啟動查詢動畫（支援多用戶，控制訊息頻率）
async function startQueryAnimation(userId: string) {
  // 清除該用戶的舊動畫（防重複）
  clearQueryAnimation(userId);
  
  // 動畫狀態序列：紅黃綠 → 黃紅綠 → 黃綠紅
  const animationStates = [
    '查詢中🔴🟡🟢',  // 紅黃綠
    '查詢中🟡🔴🟢',  // 黃紅綠  
    '查詢中🟡🟢🔴'   // 黃綠紅
  ];
  
  let currentState = 0;
  let updateCount = 0;
  const maxUpdates = 6; // 最多更新6次（避免訊息氾濫）
  const maxDuration = 15000; // 最多15秒（故障安全）
  
  animationStartTimes.set(userId, Date.now());
  
  // 每1.5秒更新一次動畫狀態（降低訊息頻率）
  const interval = setInterval(async () => {
    currentState = (currentState + 1) % animationStates.length;
    updateCount++;
    
    // 檢查是否超過最大更新次數或時間限制
    const elapsed = Date.now() - (animationStartTimes.get(userId) || 0);
    if (updateCount >= maxUpdates || elapsed >= maxDuration) {
      console.log(`⏰ 動畫自動停止 - 用戶: ${userId}, 更新次數: ${updateCount}, 經過時間: ${elapsed}ms`);
      clearQueryAnimation(userId);
      return;
    }
    
    try {
      await lineService.pushMessage(userId, animationStates[currentState]);
    } catch (error) {
      console.error('❌ 動畫更新失敗:', error);
      clearQueryAnimation(userId);
    }
  }, 1500); // 改為1.5秒間隔，減少訊息量
  
  userAnimations.set(userId, interval);
  console.log(`🎬 啟動查詢動畫 - 用戶: ${userId}`);
}

// 清除查詢動畫（支援指定用戶）
function clearQueryAnimation(userId?: string) {
  if (userId) {
    // 清除特定用戶的動畫
    const interval = userAnimations.get(userId);
    if (interval) {
      clearInterval(interval);
      userAnimations.delete(userId);
      animationStartTimes.delete(userId);
      console.log(`🛑 清除查詢動畫 - 用戶: ${userId}`);
    }
  } else {
    // 清除所有動畫（舊版本兼容）
    userAnimations.forEach((interval, uid) => {
      clearInterval(interval);
      console.log(`🛑 清除查詢動畫 - 用戶: ${uid}`);
    });
    userAnimations.clear();
    animationStartTimes.clear();
  }
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
