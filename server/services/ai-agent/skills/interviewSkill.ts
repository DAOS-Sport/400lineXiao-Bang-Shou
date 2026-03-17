import type { Skill } from '../types';

export const interviewSkill: Skill = {
  id: 'interview',
  name: '面試檢核',
  category: 'internal',
  description: '面試檢核模組用於查詢應聘者的救生員證照和注意清單狀態，協助人資快速審核面試人員。',
  keywords: ['面試', '檢核', '身分證', '救生證', '注意清單', '證照'],
  usage: `【面試檢核使用方式】

指令格式：
- 輸入「面試 + 身分證字號」
- 例如：面試 A123456789

支援的證件類型：
- 身分證：1 個英文字母 + 9 個數字（如 A123456789）
- 居留證：2 個英文字母 + 8-10 個數字

查詢內容：
- 體育署救生員證照查詢（isports.sa.gov.tw）
- Ragic 注意清單比對
- 回傳查詢結果包含：注意清單狀態、證照狀態、詳細人員資訊

使用權限：
- 僅限授權人員使用（目前 7 位白名單用戶）
- 需要 canInterviewCheck 權限

注意事項：
- 身分證字號格式必須正確，否則系統不會觸發
- 查詢結果會顯示 ✅ 或 ❌ 標記`,
  quickReplies: [
    { label: '🔍 面試檢核教學', text: '@小幫手 面試檢核怎麼用？' },
  ],
};
