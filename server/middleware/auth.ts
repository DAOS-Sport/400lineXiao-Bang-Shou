import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user?: any;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ error: '需要授權' });
      return;
    }

    // Bearer Token 驗證
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const adminToken = process.env.ADMIN_TOKEN;
      
      if (!adminToken || token !== adminToken) {
        res.status(401).json({ error: '無效的 Token' });
        return;
      }
    }
    // Basic Auth 驗證
    else if (authHeader.startsWith('Basic ')) {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
      const [username, password] = credentials.split(':');
      
      const adminUser = process.env.ADMIN_USER;
      const adminPass = process.env.ADMIN_PASS;
      
      if (!adminUser || !adminPass || username !== adminUser || password !== adminPass) {
        res.status(401).json({ error: '無效的帳號密碼' });
        return;
      }
    }
    else {
      res.status(401).json({ error: '不支援的授權方式' });
      return;
    }

    next();
  } catch (error) {
    console.error('授權驗證失敗:', error);
    res.status(500).json({ error: '內部伺服器錯誤' });
  }
}
