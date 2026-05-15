/**
 * Admin Console Routes — T003
 * 白名單管理 + 服務監聽端點
 * 掛載於 /api/admin（由 routes.ts 呼叫）
 * Auth: authMiddleware（Bearer ADMIN_TOKEN 或 Basic ADMIN_USER/ADMIN_PASS）
 */

import { Router } from 'express';
import {
  listWhitelistUsers, addWhitelistUser,
  updateWhitelistUser, deleteWhitelistUser,
} from '../services/admin/whitelistRepo';
import { aggregateHealth, getRecentSnapshots } from '../services/monitoring/healthAggregator';
import { pushHealthSnapshot, storeHealthSnapshot } from '../services/monitoring/dashboardPusher';

export const adminConsoleRouter = Router();

// ── 白名單管理 ─────────────────────────────────────────────────────────────

adminConsoleRouter.get('/whitelist', async (req, res) => {
  try {
    const users = await listWhitelistUsers();
    res.json({ success: true, total: users.length, users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

adminConsoleRouter.post('/whitelist', async (req, res) => {
  try {
    const { userId, userName, role, note } = req.body ?? {};
    if (!userId || !userName) {
      return res.status(400).json({ success: false, error: 'userId 和 userName 為必填' });
    }
    const created = await addWhitelistUser({ userId, userName, role, note });
    res.json({ success: true, user: created });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ success: false, error: '該 userId 已存在' });
    res.status(500).json({ success: false, error: err?.message });
  }
});

adminConsoleRouter.patch('/whitelist/:userId', async (req, res) => {
  try {
    const { userName, role, note, isActive } = req.body ?? {};
    const patch: any = {};
    if (userName !== undefined) patch.userName = userName;
    if (role !== undefined) patch.role = role;
    if (note !== undefined) patch.note = note;
    if (typeof isActive === 'boolean') patch.isActive = isActive;
    const updated = await updateWhitelistUser(req.params.userId, patch);
    if (!updated) return res.status(404).json({ success: false, error: '找不到該用戶' });
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

adminConsoleRouter.delete('/whitelist/:userId', async (req, res) => {
  try {
    const deleted = await deleteWhitelistUser(req.params.userId);
    if (!deleted) return res.status(404).json({ success: false, error: '找不到該用戶' });
    res.json({ success: true, userId: req.params.userId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// ── 服務健康監聽 ────────────────────────────────────────────────────────────

adminConsoleRouter.get('/service-status', async (req, res) => {
  try {
    const health = await aggregateHealth();
    res.json({ success: true, ...health });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

adminConsoleRouter.post('/service-status/snapshot', async (req, res) => {
  try {
    const health = await aggregateHealth();
    await storeHealthSnapshot(health, 'manual');
    res.json({ success: true, snapshot: health });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

adminConsoleRouter.post('/service-status/push', async (req, res) => {
  try {
    const health = await aggregateHealth();
    const result = await pushHealthSnapshot(health, 'manual');
    res.json({ success: result.ok, health, webhookResult: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

adminConsoleRouter.get('/service-status/history', async (req, res) => {
  try {
    const hours = parseInt(String(req.query.hours ?? '24'), 10);
    const snapshots = await getRecentSnapshots(Math.min(hours, 168));
    res.json({ success: true, total: snapshots.length, snapshots });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});
