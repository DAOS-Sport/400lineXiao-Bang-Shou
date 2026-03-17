import type { Skill } from '../types';
import { db } from '../../../db';
import { tasks } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

export const taskSkill: Skill = {
  id: 'task',
  name: '交辦系統',
  category: 'internal',
  description: '交辦系統用於在 LINE 群組中建立、追蹤和完成任務。支援手動交辦和 AI 自動萃取任務。',
  keywords: ['交辦', '任務', '處理事項', '代辦', '待辦', 'task'],
  usage: `【交辦系統使用方式】

建立任務：
- 在群組中輸入「交辦 + 任務內容」，例如：交辦 明天下午2點開會討論排班
- 系統會自動建立任務並分配編號（如 T001）

完成任務：
- 輸入「交辦XX完成」或「任務XX完成」（XX 為任務編號）
- 例如：交辦1完成、任務2完成

查詢未完成任務：
- 在群組中輸入「處理事項」
- 系統會列出近 30 天內所有未完成的任務

AI 自動萃取：
- 在群組中輸入「小助理請紀錄」
- 系統會用 AI 分析最近的群組對話，自動擷取任務

注意事項：
- 交辦系統僅在授權群組中可用
- 授權群組包括：新北高中、三重商工、三民高中、松山國小、竹科泳池、竹科球場、三民排班群組、駿斯IT技術群`,
  quickReplies: [
    { label: '📝 查未完成任務', text: '@小幫手 目前有多少未完成任務？' },
    { label: '📊 交辦系統教學', text: '@小幫手 交辦系統怎麼用？' },
  ],
  tools: [
    {
      name: 'query_pending_tasks',
      description: '查詢所有群組的未完成任務數量和清單',
      parameters: {},
      handler: async () => {
        try {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const pendingTasks = await db.select()
            .from(tasks)
            .where(and(
              eq(tasks.status, 'pending'),
              gte(tasks.createdAt, thirtyDaysAgo)
            ))
            .orderBy(desc(tasks.createdAt));

          if (pendingTasks.length === 0) {
            return '目前沒有未完成的任務。';
          }

          let result = `目前共有 ${pendingTasks.length} 筆未完成任務：\n\n`;
          pendingTasks.slice(0, 10).forEach((task) => {
            const created = new Date(task.createdAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            result += `• ${task.taskIdSerial}: ${task.text.substring(0, 50)}${task.text.length > 50 ? '...' : ''} (${created})\n`;
          });

          if (pendingTasks.length > 10) {
            result += `\n...還有 ${pendingTasks.length - 10} 筆，請在群組中輸入「處理事項」查看完整清單`;
          }

          return result;
        } catch (error) {
          return '查詢任務時發生錯誤，請稍後再試。';
        }
      }
    }
  ]
};
