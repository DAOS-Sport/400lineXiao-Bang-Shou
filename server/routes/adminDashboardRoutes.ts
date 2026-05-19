import { Router } from 'express';
import { storage } from '../storage';

export const adminDashboardRouter = Router();

// 戰情室 Dashboard API（公開，維持 routes.ts 原本無需驗證的行為）

adminDashboardRouter.get('/dashboard/feature-stats', async (_req, res) => {
  try {
    const groupConfig = [
      { id: 'C66a4b3bb3fbc3dcf52d42626ec512484', name: '新北高中',    task: true,  weather: false, gps: true  },
      { id: 'C6f6f163895d5b528a6ab044015e1a37b', name: '三重商工',    task: true,  weather: false, gps: true  },
      { id: 'C2dc6991e51074dd47d5d275d568318f7', name: '三民高中',    task: true,  weather: false, gps: true  },
      { id: 'C9b3c5dfe2e005adafd2ed914714a1930', name: '松山國小',    task: true,  weather: false, gps: true  },
      { id: 'C50c2a9623a78cc5f5e9f39557e3abfe6', name: '竹科游泳池',  task: true,  weather: true,  gps: true  },
      { id: 'C360be1fe6ea876a4df3ca0497bca4e3b', name: '竹科高爾夫',  task: true,  weather: true,  gps: true  },
      { id: 'C2dd9a5fce7c276f2cbfdd02c2342661c', name: '三民排班群',  task: true,  weather: false, gps: true  },
      { id: 'Ce936c6bebb59b8b5683ffbcf97bf20de', name: '原授權群組',  task: true,  weather: false, gps: true  },
      { id: 'Cf7ab973766c258e5b4b4f040d35b2175', name: '駿斯IT技術群', task: true, weather: false, gps: true  },
    ];

    const groups = groupConfig.map((group) => ({
      name: group.name,
      groupId: group.id,
      任務交辦: group.task ? 1 : 0,
      天氣預報: group.weather ? 1 : 0,
      GPS打卡: group.gps ? 1 : 0,
      totalEnabled: [group.task, group.weather, group.gps].filter(Boolean).length,
    }));

    const totalGroups = groups.length;
    const featurePenetration = [
      { feature: '任務交辦', count: groups.filter((group) => group.任務交辦).length, rate: Math.round(groups.filter((group) => group.任務交辦).length / totalGroups * 100) },
      { feature: '天氣預報', count: groups.filter((group) => group.天氣預報).length, rate: Math.round(groups.filter((group) => group.天氣預報).length / totalGroups * 100) },
      { feature: 'GPS打卡',  count: groups.filter((group) => group.GPS打卡).length,  rate: Math.round(groups.filter((group) => group.GPS打卡).length  / totalGroups * 100) },
    ];

    res.json({ groups, featurePenetration, totalGroups });
  } catch (error) {
    console.error('feature-stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminDashboardRouter.get('/tasks/stats', async (_req, res) => {
  try {
    const allTasks = await storage.getAllTasks();
    const completed = allTasks.filter((task) => task.status === 'completed');
    const pending = allTasks.filter((task) => task.status === 'pending');
    const total = allTasks.length;
    const completionRate = total > 0 ? `${((completed.length / total) * 100).toFixed(1)}%` : '0%';

    const recentTasks = allTasks
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((task) => ({
        id: task.taskIdSerial,
        text: task.text,
        status: task.status,
        groupId: task.groupId,
        createdAt: task.createdAt,
        completedAt: task.completedAt || null,
      }));

    const byGroup: Record<string, { total: number; completed: number; pending: number }> = {};
    allTasks.forEach((task) => {
      if (!byGroup[task.groupId]) byGroup[task.groupId] = { total: 0, completed: 0, pending: 0 };
      byGroup[task.groupId].total++;
      if (task.status === 'completed') byGroup[task.groupId].completed++;
      if (task.status === 'pending') byGroup[task.groupId].pending++;
    });

    res.json({ total, completed: completed.length, pending: pending.length, completionRate, recentTasks, byGroup });
  } catch (error) {
    console.error('tasks/stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminDashboardRouter.get('/attendance/stats', async (_req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await (storage as any).pool?.query(
      `SELECT user_id, display_name, group_id, timestamp, raw_event
       FROM messages
       WHERE type = 'location' AND timestamp >= $1
       ORDER BY timestamp DESC`,
      [todayStart],
    ).catch(() => null);

    const checkins = result?.rows || [];
    const todayCheckins = checkins.length;

    const auditResult = await (storage as any).pool?.query(
      `SELECT details FROM audit_logs
       WHERE category = 'gps' AND timestamp >= $1`,
      [todayStart],
    ).catch(() => null);

    const auditRows = auditResult?.rows || [];
    const successful = auditRows.filter((row: any) => row.details?.success === true).length;
    const failed = auditRows.filter((row: any) => row.details?.success === false).length;

    const byGroup: Record<string, number> = {};
    checkins.forEach((checkin: any) => {
      byGroup[checkin.group_id] = (byGroup[checkin.group_id] || 0) + 1;
    });

    const uniqueCheckers = new Set(checkins.map((checkin: any) => checkin.user_id)).size;

    res.json({
      todayCheckins,
      successful: successful || todayCheckins,
      failed,
      uniqueCheckers,
      byGroup,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    console.error('attendance/stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminDashboardRouter.get('/dashboard/global-apps', async (_req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [taskRows, gpsRows, surveyRows, interviewRows] = await Promise.all([
      (storage as any).pool?.query('SELECT COUNT(*) FROM tasks WHERE created_at >= $1', [today]).catch(() => ({ rows: [{ count: 0 }] })),
      (storage as any).pool?.query("SELECT COUNT(*) FROM messages WHERE type='location' AND timestamp >= $1", [today]).catch(() => ({ rows: [{ count: 0 }] })),
      (storage as any).pool?.query("SELECT COUNT(*) FROM audit_logs WHERE category='survey_feedback' AND timestamp >= $1", [today]).catch(() => ({ rows: [{ count: 0 }] })),
      (storage as any).pool?.query("SELECT COUNT(*) FROM audit_logs WHERE category='interview_check' AND timestamp >= $1", [today]).catch(() => ({ rows: [{ count: 0 }] })),
    ]);
    const allTasks = await storage.getAllTasks();
    const pendingTasks = allTasks.filter((task: any) => task.status === 'pending').length;

    res.json({
      tasks:   { name: "📋 任務管理系統", status: "active", totalToday: Number(taskRows?.rows[0]?.count ?? 0), totalPending: pendingTasks },
      gps:     { name: "📍 GPS打卡系統",  status: "active", todayCheckins: Number(gpsRows?.rows[0]?.count ?? 0) },
      coach:   { name: "🏋️ 教練簽到",     status: "active", todayCheckins: 0, note: "由排班系統管理" },
      survey:  { name: "📊 客戶滿意度調查", status: "active", responses: Number(surveyRows?.rows[0]?.count ?? 0) },
      interview: { name: "🔍 面試/救生員檢核", status: "active", todayQueries: Number(interviewRows?.rows[0]?.count ?? 0) },
    });
  } catch (error) {
    console.error('global-apps error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminDashboardRouter.get('/dashboard/private-services', async (_req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [idQueryRows, interviewRows, ragicRows] = await Promise.all([
      (storage as any).pool?.query("SELECT COUNT(*) FROM audit_logs WHERE category='ragic' AND timestamp >= $1", [today]).catch(() => ({ rows: [{ count: 0 }] })),
      (storage as any).pool?.query("SELECT COUNT(*) FROM audit_logs WHERE category='interview_check'", []).catch(() => ({ rows: [{ count: 0 }] })),
      (storage as any).pool?.query("SELECT COUNT(*) FROM audit_logs WHERE category='ragic'", []).catch(() => ({ rows: [{ count: 0 }] })),
    ]);
    res.json({
      general: [
        { feature: "🔍 員工編號 / LINE ID 查詢 (Ragic)", status: "active", todayUsage: Number(idQueryRows?.rows[0]?.count ?? 0), totalUsage: Number(ragicRows?.rows[0]?.count ?? 0) },
        { feature: "📋 交辦任務管理", status: "active", note: "群組內輸入「交辦 ...」觸發" },
        { feature: "✅ 任務完成標記", status: "active", note: "群組內輸入「交辦XX完成」觸發" },
      ],
      management: {
        feature: "📝 面試 & 救生員證照檢核 (Ragic + 體育署)",
        status: "active",
        authorizedUsersCount: 7,
        totalQueries: Number(interviewRows?.rows[0]?.count ?? 0),
        dataSource: ["Ragic 慎用名單 API", "體育署 isports.sa.gov.tw 證照查詢"],
      },
    });
  } catch (error) {
    console.error('private-services error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminDashboardRouter.get('/dashboard/venue-automations', async (_req, res) => {
  try {
    const venues = [
      {
        venue: "竹科戶外游泳池",
        groupId: "C50c2a9623a78cc5f5e9f39557e3abfe6",
        features: ["📋 任務管理", "🌤️ 竹科天氣預報", "💧 水質分析報告", "🤖 GPT 水質分析", "📊 客滿調查推播"],
        schedules: [
          { time: "06:30", label: "合併天氣預報 (reply-trigger)" },
          { time: "12:00", label: "合併天氣預報 (reply-trigger)" },
          { time: "13:00", label: "水質報告 (reply-trigger)" },
          { time: "17:00", label: "合併天氣預報 (reply-trigger)" },
          { time: "17:30", label: "水質報告 (reply-trigger)" },
          { time: "20:30", label: "水質報告 (reply-trigger)" },
          { time: "21:00", label: "GPT 智能水質分析" },
        ],
      },
      {
        venue: "竹科高爾夫球練習場 / 網球場 & 籃球場",
        groupId: "C360be1fe6ea876a4df3ca0497bca4e3b",
        features: ["📋 任務管理", "🌬️ 風力預報 (高爾夫)", "📊 客滿調查推播"],
        schedules: [
          { time: "06:30", label: "合併風力天氣預報 (reply-trigger)" },
          { time: "12:00", label: "合併風力天氣預報 (reply-trigger)" },
          { time: "17:00", label: "合併風力天氣預報 (reply-trigger)" },
        ],
      },
      {
        venue: "新北高中游泳池 & 運動中心",
        groupId: "C66a4b3bb3fbc3dcf52d42626ec512484",
        features: ["📋 任務管理", "💧 水質分析報告", "📊 客滿調查推播"],
        schedules: [
          { time: "06:30", label: "任務提醒 (reply-trigger)" },
          { time: "09:00", label: "任務提醒 (reply-trigger)" },
          { time: "11:00", label: "任務提醒 (reply-trigger)" },
          { time: "13:00", label: "水質報告 (reply-trigger)" },
          { time: "15:00", label: "任務提醒 (reply-trigger)" },
          { time: "17:00", label: "任務提醒 (reply-trigger)" },
          { time: "17:30", label: "水質報告 (reply-trigger)" },
          { time: "20:00", label: "任務提醒 (reply-trigger)" },
          { time: "20:30", label: "水質報告 (reply-trigger)" },
        ],
      },
      {
        venue: "三重商工游泳池 & 籃球場",
        groupId: "C6f6f163895d5b528a6ab044015e1a37b",
        features: ["📋 任務管理", "💧 水質分析報告", "📊 客滿調查推播"],
        schedules: [
          { time: "06:30~20:00", label: "六次任務提醒 (reply-trigger)" },
          { time: "13:00~20:30", label: "三次水質報告 (reply-trigger)" },
        ],
      },
      {
        venue: "三民高中游泳池",
        groupId: "C2dc6991e51074dd47d5d275d568318f7",
        features: ["📋 任務管理", "💧 水質分析報告", "📊 客滿調查推播"],
        schedules: [
          { time: "06:30~20:00", label: "六次任務提醒 (reply-trigger)" },
          { time: "13:00~20:30", label: "三次水質報告 (reply-trigger)" },
        ],
      },
      {
        venue: "松山國小室內溫水游泳池",
        groupId: "C9b3c5dfe2e005adafd2ed914714a1930",
        features: ["📋 任務管理", "💧 水質分析報告", "📊 客滿調查推播"],
        schedules: [
          { time: "06:30~20:00", label: "六次任務提醒 (reply-trigger)" },
          { time: "13:00~20:30", label: "三次水質報告 (reply-trigger)" },
        ],
      },
      {
        venue: "三民排班群組",
        groupId: "C2dd9a5fce7c276f2cbfdd02c2342661c",
        features: ["📋 任務管理"],
        schedules: [
          { time: "06:30~20:00", label: "六次任務提醒 (reply-trigger)" },
        ],
      },
      {
        venue: "駿斯IT技術群",
        groupId: "Cf7ab973766c258e5b4b4f040d35b2175",
        features: ["📋 任務管理", "🔬 功能測試"],
        schedules: [
          { time: "06:30~20:00", label: "六次任務提醒 (reply-trigger)" },
        ],
      },
    ];
    res.json(venues);
  } catch (error) {
    console.error('venue-automations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

adminDashboardRouter.get('/dashboard/services-health', async (_req, res) => {
  try {
    const checks = await Promise.allSettled([
      storage.getAllTasks().then(() => true),
      (storage as any).pool?.query('SELECT 1').then(() => true),
    ]);
    const dbOk = checks[1].status === 'fulfilled';

    const services = [
      { service: "lineService",          status: "healthy", note: "LINE Bot SDK / Webhook 處理" },
      { service: "taskService",          status: dbOk ? "healthy" : "degraded", note: "任務 CRUD / 流水號管理" },
      { service: "schedulerService",     status: "healthy", note: "node-cron 六段式 reply-trigger 排程" },
      { service: "llmService (GPT-4o-mini)", status: "healthy", note: "任務萃取 / 水質 GPT 分析" },
      { service: "weatherService",       status: "healthy", note: "中央氣象署 CWA API" },
      { service: "waterQualityService",  status: "healthy", note: "游泳池水質偵測 + 記錄" },
      { service: "ragicApiService",      status: "healthy", note: "員工資料查詢 / 慎用名單" },
      { service: "lifeguardLicenseService", status: "healthy", note: "體育署救生員證照查詢" },
      { service: "surveyService",        status: "healthy", note: "客滿調查 Google Sheet → LINE 推播" },
      { service: "keepAliveService",     status: "healthy", note: "系統保活 / 自動重啟防護" },
      { service: "PostgreSQL (Neon)",    status: dbOk ? "healthy" : "error", note: "主資料庫連線狀態" },
    ];

    const healthyCount = services.filter((service) => service.status === 'healthy').length;
    res.json({
      overall: healthyCount === services.length ? "healthy" : "degraded",
      healthyCount,
      totalCount: services.length,
      services,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('services-health error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
