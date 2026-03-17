import type { Skill } from '../types';

export const surveySkill: Skill = {
  id: 'survey',
  name: '滿意度調查',
  category: 'internal',
  description: '滿意度調查系統用於收集和處理客戶的滿意度回饋。',
  keywords: ['問卷', '調查', '滿意度', 'survey', '回饋'],
  usage: `【滿意度調查系統】

功能說明：
- 系統接收外部問卷平台的回饋資料
- 自動處理和記錄調查結果
- 支援 webhook 接收問卷回覆

運作方式：
- 透過 /api/survey-webhook 端點接收外部系統的調查資料
- 自動記錄到系統中

注意事項：
- 此功能為後台自動化系統，一般用戶無需手動操作
- 如需設定或修改問卷，請聯繫系統管理員`,
  quickReplies: [
    { label: '📋 功能總覽', text: '@小幫手 有哪些功能？' },
  ],
};
