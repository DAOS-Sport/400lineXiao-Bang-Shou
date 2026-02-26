/**
 * Keep Alive Component - 前端保活組件
 * 定期 ping 後端，防止 Replit 自動暫停
 */

import { useEffect, useState } from 'react';

interface KeepAliveStatus {
  isRunning: boolean;
  checkCount: number;
  uptime: number;
}

export function KeepAlive() {
  const [status, setStatus] = useState<KeepAliveStatus | null>(null);
  const [lastPing, setLastPing] = useState<Date | null>(null);

  useEffect(() => {
    const pingServer = async () => {
      try {
        const response = await fetch('/health');
        const data = await response.json();
        
        if (data.keepAlive) {
          setStatus(data.keepAlive);
        }
        setLastPing(new Date());
        
        // 每次 ping 都會記錄在控制台，避免被誤認為閒置
        console.log(`🟢 Keep-Alive Ping: ${new Date().toISOString()}`);
        
      } catch (error) {
        console.error('❌ Keep-Alive Ping 失敗:', error);
      }
    };

    // 立即執行一次
    pingServer();

    // 每 3 分鐘 ping 一次
    const interval = setInterval(pingServer, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // 隱藏的組件，不顯示在界面上
  return (
    <div style={{ display: 'none' }}>
      Keep-Alive Service Active
      {status && (
        <div>
          Status: {status.isRunning ? 'Running' : 'Stopped'}
          Checks: {status.checkCount}
          Last Ping: {lastPing?.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}