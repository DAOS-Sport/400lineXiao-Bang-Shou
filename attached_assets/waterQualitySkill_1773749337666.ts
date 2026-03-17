import type { Skill } from '../types';

export const employeeSkill: Skill = {
  id: 'employee',
  name: '員工查詢',
  category: 'internal',
  description: '員工查詢模組透過 Ragic 人事資料庫查詢員工編號和相關資訊。',
  keywords: ['員工', 'id', '編號', '查詢', '員工編號', 'ragic'],
  usage: `【員工查詢使用方式】

查詢自己的員工編號：
- 在私人聊天中輸入「id」或「查詢員工編號」
- 系統會根據你的 LINE ID 查詢 Ragic 人事資料庫
- 回傳你的員工編號

運作原理：
- 系統透過你的 LINE User ID 比對 Ragic 資料庫中的個人 LINE ID 欄位
- 確認在職狀態後回傳員工編號
- 查詢結果會暫存 24 小時，加速後續查詢

注意事項：
- 必須在私人聊天中使用（非群組）
- 你的 LINE 帳號必須已經登記在 Ragic 人事系統中
- 如果查詢不到，請聯繫人資確認 Ragic 資料是否正確`,
  quickReplies: [
    { label: '🔍 員工查詢教學', text: '@小幫手 怎麼查員工編號？' },
  ],
};
