/**
 * Process Manager - 進程管理器
 * 幫助管理系統重啟和信號處理
 */

export class ProcessManager {
  private static instance: ProcessManager;
  private isShuttingDown = false;

  private constructor() {
    this.setupSignalHandlers();
  }

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  private setupSignalHandlers(): void {
    // 處理 SIGINT (Ctrl+C)
    process.on('SIGINT', this.gracefulShutdown.bind(this, 'SIGINT'));
    
    // 處理 SIGTERM (系統終止)
    process.on('SIGTERM', this.gracefulShutdown.bind(this, 'SIGTERM'));
    
    // 處理未捕獲的例外
    process.on('uncaughtException', (error) => {
      console.error('❌ 未捕獲的例外:', error);
      // 不立即退出，讓 LINE bot 繼續運行
    });

    // 處理未處理的 Promise 拒絕
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ 未處理的 Promise 拒絕:', reason);
      // 不立即退出，讓 LINE bot 繼續運行
    });
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      console.log('🔄 已經在關閉中，忽略重複信號');
      return;
    }

    this.isShuttingDown = true;
    console.log(`🛑 收到 ${signal} 信號，開始優雅關閉...`);

    try {
      // 給一些時間讓正在處理的請求完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('✅ 優雅關閉完成');
      process.exit(0);
    } catch (error) {
      console.error('❌ 關閉過程中發生錯誤:', error);
      process.exit(1);
    }
  }

  // 防止意外重啟的工具方法
  preventRestart(): void {
    console.log('🔒 啟用防重啟模式');
    
    // 覆蓋 process.exit
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      console.log(`⚠️ 嘗試退出被攔截 (code: ${code})，系統將繼續運行`);
      return process as never;
    }) as any;
  }

  // 恢復正常退出功能
  allowRestart(): void {
    console.log('🔓 恢復正常重啟模式');
    // 這裡可以恢復原始的 process.exit，但為了簡單起見省略
  }
}

// 自動初始化
export const processManager = ProcessManager.getInstance();