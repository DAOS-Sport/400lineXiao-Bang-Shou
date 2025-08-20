import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';

// 擴展 Request 類型以包含 rawBody
interface LineRequest extends Request {
  rawBody?: Buffer;
}

export function validateLineSignature(req: LineRequest, res: Response, next: NextFunction): void {
  try {
    const signature = req.headers['x-line-signature'] as string;
    const channelSecret = process.env.CHANNEL_SECRET; // 🔧 修復：正確的環境變數名稱

    if (!signature || !channelSecret) {
      console.error('缺少簽章或 Channel Secret');
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // 🔧 修復：確保使用 Buffer 進行簽名驗證
    const body = Buffer.isBuffer(req.rawBody) 
      ? req.rawBody 
      : Buffer.from(JSON.stringify(req.body));
    const expectedSignature = 'SHA256=' + createHmac('sha256', channelSecret)
      .update(body)
      .digest('base64');

    console.log('🔐 簽章驗證 - 接收:', signature);
    console.log('🔐 簽章驗證 - 預期:', expectedSignature);

    // 比較簽章
    if (signature !== expectedSignature) {
      console.error('LINE 簽章驗證失敗');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    console.log('✅ LINE 簽章驗證成功');
    next();
  } catch (error) {
    console.error('簽章驗證錯誤:', error);
    res.status(403).json({ error: 'Signature validation failed' });
  }
}
