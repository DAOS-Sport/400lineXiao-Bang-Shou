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
      description: '查詢各授權群組的未完成任務數量統計（不顯示任務內容，保護群組隱私）',
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
            ));

          if (pendingTasks.length === 0) {
            return '目前所有群組都沒有未完成的任務。';
          }

          // 只統計各群組數量，不揭露任務內容（群組隔離保護）
          const groupMap: Record<string, string> = {
            'C66a4b3bb3fbc3dcf52d42626ec512484': '新北高中游泳池',
            'C6f6f163895d5b528a6ab044015e1a37b': '三重商工游泳池',
            'C2dc6991e51074dd47d5d275d568318f7': '三民高中游泳池',
            'C9b3c5dfe2e005adafd2ed914714a1930': '松山國小游泳池',
            'C50c2a9623a78cc5f5e9f39557e3abfe6': '竹科戶外游泳池',
            'C360be1fe6ea876a4df3ca0497bca4e3b': '竹科高爾夫/網球場',
            'C2dd9a5fce7c276f2cbfdd02c2342661c': '三民排班群組',
            'Cf7ab973766c258e5b4b4f040d35b2175': '駿斯IT技術群',
          };

          const countByGroup: Record<string, number> = {};
          pendingTasks.forEach(task => {
            countByGroup[task.groupId] = (countByGroup[task.groupId] || 0) + 1;
          });

          let result = `📋 各群組未完成任務統計（近 30 天）\n共 ${pendingTasks.length} 筆\n\n`;
          Object.entries(countByGroup).forEach(([groupId, count]) => {
            const name = groupMap[groupId] || groupId.substring(0, 8) + '...';
            result += `• ${name}：${count} 筆\n`;
          });
          result += '\n💡 若要查看詳細任務，請在各群組中輸入「處理事項」';

          return result;
        } catch (error) {
          return '查詢任務時發生錯誤，請稍後再試。';
        }
      }
    }
  ]
};
