import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { processManager } from "./utils/processManager";
import "./utils/stableRunner"; // 自動應用穩定運行優化

const app = express();
app.use(cors()); // 允許所有跨網域請求（戰情室前端用）
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // 初始化 PostgreSQL 資料庫連接
  try {
    // 測試資料庫連接
    await db.$client.query('SELECT 1');
    log("PostgreSQL 資料庫連接成功");
    
    // 初始化備份系統
    const { simpleBackupService } = await import('./services/simpleBackupService');
    await simpleBackupService.initializeBackupSystem();
    
    // 初始化面試檢核授權用戶（確保生產環境有資料）
    const { initializeAuthorizedUsers } = await import('./services/initializeAuthorizedUsers');
    await initializeAuthorizedUsers();
    
    // 啟動系統保活服務
    const { keepAliveService } = await import('./services/keepAliveService');
    keepAliveService.start();
    
    // 啟用防重啟模式（減少開發環境不必要的重啟）
    if (process.env.NODE_ENV === 'development') {
      console.log('🔒 開發環境：啟用穩定運行模式');
      processManager.preventRestart();
    }
  } catch (error) {
    console.error("PostgreSQL 資料庫連接失敗:", error);
    process.exit(1);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
