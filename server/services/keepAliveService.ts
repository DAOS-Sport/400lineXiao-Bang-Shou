/**
 * Keep Alive Service - 保持系統持續運行
 * 防止 Replit 自動暫停服務
 */

import { storage } from '../storage';

export class KeepAliveService {
  private intervalId: NodeJS.Timeout | null = null;
  private healthCheckCount = 0;

  // 啟動保活服務
  start(): void {
    console.log('🔄 啟動系統保活服務');
    
    // 每 5 分鐘執行一次保活檢查
    this.intervalId = setInterval(async () => {
      await this.performHealthCheck();
    }, 5 * 60 * 1000); // 5 分鐘

    console.log('✅ 保活服務已啟動 - 每 5 分鐘檢查一次');
  }

  // 停止保活服務
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 保活服務已停止');
    }
  }

  // 執行健康檢查
  private async performHealthCheck(): Promise<void> {
    try {
      this.healthCheckCount++;
      
      // 記錄系統活躍狀態
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'system',
        message: '系統保活檢查',
        details: { 
          checkCount: this.healthCheckCount,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }
      });

      // 每 12 次檢查（1 小時）輸出狀態
      if (this.healthCheckCount % 12 === 0) {
        console.log(`💓 系統保活檢查 #${this.healthCheckCount} - 運行時間: ${Math.floor(process.uptime() / 60)} 分鐘`);
      }

    } catch (error) {
      console.error('❌ 保活檢查失敗:', error);
    }
  }

  // 獲取運行狀態
  getStatus(): {
    isRunning: boolean;
    checkCount: number;
    uptime: number;
  } {
    return {
      isRunning: this.intervalId !== null,
      checkCount: this.healthCheckCount,
      uptime: process.uptime()
    };
  }
}

// 創建單例實例
export const keepAliveService = new KeepAliveService();