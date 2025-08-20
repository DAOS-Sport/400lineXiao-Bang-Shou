const express = require('express');
const crypto = require('crypto');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// 配置 WebSocket
neonConfig.webSocketConstructor = ws;

// 創建 Express 應用
const app = express();

// 基本中間件
app.use(express.json());
app.use(express.raw({ type: 'application/json' }));

// 環境變數檢查
const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!CHANNEL_SECRET || !CHANNEL_ACCESS_TOKEN || !DATABASE_URL) {
  console.error('❌ 環境變數未設定');
  process.exit(1);
}

// 資料庫連接
const pool = new Pool({ connectionString: DATABASE_URL });

// 日誌中間件
app.use((req, res, next) => {
  console.log(`🔥 ${req.method} ${req.path} ${new Date().toISOString()}`);
  next();
});

// 根路由
app.get('/', (req, res) => {
  console.log('✅ 根路由成功');
  res.send('LINE Bot Simple Server Running');
});

// 健康檢查
app.get('/health', (req, res) => {
  console.log('💚 健康檢查成功');
  res.json({
    status: 'ok',
    service: 'Simple LINE Bot',
    timestamp: new Date().toISOString()
  });
});

// LINE 簽名驗證
function verifySignature(signature, body) {
  const expectedSignature = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return signature === `SHA256=${expectedSignature}`;
}

// Webhook 路由
app.post('/webhook', (req, res) => {
  console.log('🎯 Webhook 請求到達!');
  
  const signature = req.get('x-line-signature');
  const body = JSON.stringify(req.body);
  
  // 驗證簽名
  if (!signature || !verifySignature(signature, body)) {
    console.log('❌ 簽名驗證失敗');
    return res.status(401).send('Unauthorized');
  }
  
  console.log('✅ 簽名驗證成功');
  
  // 處理事件
  const events = req.body.events || [];
  console.log(`📨 收到 ${events.length} 個事件`);
  
  events.forEach(event => {
    console.log(`📋 事件類型: ${event.type}`);
    if (event.type === 'message' && event.message.type === 'text') {
      console.log(`💬 訊息: ${event.message.text}`);
      
      // 儲存到資料庫 (簡化版)
      storeMessage(event).catch(err => {
        console.error('❌ 儲存訊息失敗:', err.message);
      });
      
      // 處理任務邏輯
      handleMessage(event).catch(err => {
        console.error('❌ 處理訊息失敗:', err.message);
      });
    }
  });
  
  // 立即回應 LINE
  res.status(200).send('OK');
});

// 儲存訊息到資料庫
async function storeMessage(event) {
  try {
    const query = `
      INSERT INTO messages (event_type, user_id, group_id, text, raw_event, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await pool.query(query, [
      event.type,
      event.source?.userId || null,
      event.source?.groupId || null,
      event.message?.text || null,
      JSON.stringify(event),
      new Date()
    ]);
    
    console.log('✅ 訊息已儲存');
  } catch (error) {
    console.error('❌ 儲存訊息錯誤:', error.message);
  }
}

// 處理訊息邏輯
async function handleMessage(event) {
  const text = event.message.text;
  const replyToken = event.replyToken;
  
  try {
    if (text.includes('交辦')) {
      console.log('📋 偵測到任務交辦');
      await replyToLine(replyToken, '✅ 任務已記錄！');
    } else if (text.startsWith('#任務列表')) {
      console.log('📋 查詢任務列表');
      await replyToLine(replyToken, '📋 查詢任務列表中...');
    } else if (text.startsWith('#萃取任務')) {
      console.log('🤖 AI 任務萃取');
      await replyToLine(replyToken, '🤖 正在分析對話萃取任務...');
    } else if (text.startsWith('#結案')) {
      console.log('✅ 任務結案');
      await replyToLine(replyToken, '✅ 任務已結案！');
    }
  } catch (error) {
    console.error('❌ 處理訊息錯誤:', error.message);
  }
}

// 回覆 LINE 訊息
async function replyToLine(replyToken, message) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [{
          type: 'text',
          text: message
        }]
      })
    });
    
    if (response.ok) {
      console.log('✅ LINE 回覆成功');
    } else {
      console.error('❌ LINE 回覆失敗:', response.status);
    }
  } catch (error) {
    console.error('❌ LINE 回覆錯誤:', error.message);
  }
}

// 測試資料庫連接
async function testDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ 資料庫連接成功');
    return true;
  } catch (error) {
    console.error('❌ 資料庫連接失敗:', error.message);
    return false;
  }
}

// 啟動服務器
async function startServer() {
  // 測試資料庫
  const dbOk = await testDatabase();
  if (!dbOk) {
    console.error('❌ 資料庫連接失敗，退出');
    process.exit(1);
  }
  
  const port = parseInt(process.env.PORT || '5000', 10);
  
  app.listen(port, '0.0.0.0', () => {
    console.log('🚀 Simple LINE Bot 服務器啟動成功！');
    console.log(`📡 端口: ${port}`);
    console.log('🔗 Webhook URL: https://a8b17e31-6a56-4bea-9569-8186d14315a3-ronchen2.replit.app/webhook');
    console.log('💚 健康檢查: https://a8b17e31-6a56-4bea-9569-8186d14315a3-ronchen2.replit.app/health');
    console.log('========================');
    console.log('🎯 現在可以在 LINE Console 中測試 webhook！');
  });
}

// 全域錯誤處理
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的例外:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

// 啟動
startServer();