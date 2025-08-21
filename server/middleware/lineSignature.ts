import { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';

export function validateLineSignature(req: Request, res: Response, next: NextFunction): void {
  try {
    const signature = req.headers['x-line-signature'] as string;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!signature || !channelSecret) {
      console.error('缺少簽章或 Channel Secret');
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // 計算預期的簽章
    const body = JSON.stringify(req.body);
    const expectedSignature = createHmac('sha256', channelSecret)
      .update(body)
      .digest('base64');

    // 比較簽章
    if (signature !== expectedSignature) {
      console.error('LINE 簽章驗證失敗');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    next();
  } catch (error) {
    console.error('簽章驗證錯誤:', error);
    res.status(403).json({ error: 'Signature validation failed' });
  }
}
