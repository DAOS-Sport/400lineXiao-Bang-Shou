import type { Skill } from '../types';

export const employeeSkill: Skill = {
  id: 'employee',
  name: '員工查詢',
  category: 'internal',
  description: '員工查詢模組透過 Ragic 人事資料庫，以 LINE USER ID 查詢員工資料。',
  keywords: ['員工', 'id', '編號', '查詢', '員工編號', 'ragic', 'LINE USER ID', 'userid'],
  usage: `【員工查詢使用方式】

查詢自己的員工資料：
- 在私人聊天中輸入「id」或「查詢員工編號」
- 系統會根據你的 LINE USER ID 查詢 Ragic 人事資料庫
- 回傳你的 LINE USER ID 與員工編號

查詢自己的 LINE USER ID：
- 在任何聊天中輸入「查詢ID」或「我的ID」
- 系統會回傳你的 LINE USER ID（首次加入時需要此 ID 填入入職系統）

運作原理：
- 系統透過你的 LINE USER ID 比對 Ragic 資料庫中的個人 LINE ID 欄位
- 確認在職狀態後回傳 LINE USER ID 及員工編號

注意事項：
- 「id」指令必須在私人聊天中使用（非群組）
- 你的 LINE 帳號必須已經登記在 Ragic 人事系統中
- 如果查詢不到，請聯繫人資確認 Ragic 資料是否正確`,
  quickReplies: [
    { label: '🔍 員工查詢教學', text: '@小幫手 怎麼查員工編號？' },
  ],
};
