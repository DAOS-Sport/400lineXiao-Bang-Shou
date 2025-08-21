/**
 * Stable Runner - 穩定運行器
 * 減少開發環境中的不必要重啟
 */

export class StableRunner {
  private static isShuttingDown = false;

  // 防止快速連續重啟
  static preventRapidRestart(): void {
    // 處理進程信號
    process.on('SIGTERM', StableRunner.handleShutdown);
    process.on('SIGINT', StableRunner.handleShutdown);
    
    // 增強錯誤處理
    process.on('uncaughtException', (error) => {
      console.error('未捕獲的異常，但系統將繼續運行:', error.message);
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error('未處理的 Promise 拒絕，但系統將繼續運行:', reason);
    });
  }

  private static handleShutdown = (signal: string) => {
    if (StableRunner.isShuttingDown) {
      console.log('已在關閉程序中，忽略重複信號');
      return;
    }
    
    StableRunner.isShuttingDown = true;
    console.log(`收到 ${signal} 信號，將在 3 秒後重啟...`);
    
    setTimeout(() => {
      process.exit(0);
    }, 3000);
  }

  // 優化服務器設置
  static optimizeServer(): void {
    // 優化 Node.js 設置以提高穩定性
    if (process.env.NODE_ENV === 'development') {
      process.env.UV_THREADPOOL_SIZE = '10';
      console.log('開發環境優化設置已應用');
    }
  }

  // 監控系統健康狀態
  static startHealthMonitor(): void {
    const healthCheck = () => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // 只在內存使用過高時才輸出警告
      if (memUsage.heapUsed > 200 * 1024 * 1024) { // 200MB
        console.log(`⚠️ 內存使用較高: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
      }
      
      // 記錄到系統日誌（每30分鐘）
      setTimeout(healthCheck, 30 * 60 * 1000);
    };

    // 30分鐘後開始第一次檢查
    setTimeout(healthCheck, 30 * 60 * 1000);
  }

  // 優化 NODE_ENV 設置
  static optimizeEnvironment(): void {
    // 設置更好的 Node.js 環境變數
    process.env.UV_THREADPOOL_SIZE = '10'; // 增加線程池大小
    process.env.NODE_OPTIONS = '--max-old-space-size=512'; // 限制內存使用
    
    console.log('⚙️ 環境優化完成');
  }
}

// 自動應用穩定運行優化
if (process.env.NODE_ENV === 'development') {
  StableRunner.preventRapidRestart();
  StableRunner.optimizeServer();
  StableRunner.startHealthMonitor();
  console.log('🔒 穩定運行模式已啟用');
}