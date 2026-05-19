import { Router } from 'express';
import {
  getMonitoringCapabilities,
  getMonitoringCapability,
  getMonitoringDependencies,
  getMonitoringEvents,
  getMonitoringFullStatus,
  getMonitoringRoutes,
  getMonitoringSnapshots,
} from '../services/monitoring/monitoringAggregator';

export const monitoringRouter = Router();

monitoringRouter.get('/full-status', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const payload = await getMonitoringFullStatus({ force });
    return res.json(payload);
  } catch (err: any) {
    console.error('❌ [internal/monitoring/full-status] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

monitoringRouter.get('/capabilities', async (_req, res) => {
  try {
    const items = await getMonitoringCapabilities();
    return res.json({ items, total: items.length });
  } catch (err: any) {
    console.error('❌ [internal/monitoring/capabilities] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

monitoringRouter.get('/capabilities/:key', async (req, res) => {
  try {
    const item = await getMonitoringCapability(req.params.key);
    if (!item) return res.status(404).json({ message: 'CAPABILITY_NOT_FOUND' });
    return res.json({ data: item });
  } catch (err: any) {
    console.error('❌ [internal/monitoring/capabilities/:key] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

monitoringRouter.get('/events', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const payload = await getMonitoringEvents(limit);
    return res.json(payload);
  } catch (err: any) {
    console.error('❌ [internal/monitoring/events] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

monitoringRouter.get('/snapshots', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const payload = await getMonitoringSnapshots(hours);
    return res.json(payload);
  } catch (err: any) {
    console.error('❌ [internal/monitoring/snapshots] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

monitoringRouter.get('/routes', (_req, res) => {
  return res.json(getMonitoringRoutes());
});

monitoringRouter.get('/dependencies', (_req, res) => {
  return res.json(getMonitoringDependencies());
});
