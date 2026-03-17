import type { Skill } from '../types';

export const clockInSkill: Skill = {
  id: 'clock-in',
  name: '排班打卡系統',
  category: 'external',
  externalUrl: 'https://smart-schedule-manager.replit.app',
  status: 'active',
  description: '排班打卡系統（Smart Schedule Manager）是獨立部署的外部系統，員工可透過 LINE 傳送 GPS 位置訊息自動打卡，管理員可在網頁上管理排班。',
  keywords: ['打卡', '排班', 'GPS', '位置', '出勤', '簽到', '班表', '上班', '下班'],
  usage: `【排班打卡系統使用方式】

GPS 打卡：
1. 在 LINE 群組中點選左下角「+」按鈕
2. 選擇「位置資訊」
3. 確認你的所在位置，點選「傳送」
4. 系統自動偵測 GPS 座標，轉發至排班系統
5. 系統回覆打卡結果（場館名稱、距離、成功/失敗）

支援打卡的群組：
- 新北高中游泳池 & 運動中心
- 竹科戶外游泳池
- 竹科高爾夫球練習場 / 網球場 & 籃球場
- 三民排班群組
- 其他授權群組

排班管理（網頁版）：
- 網址：https://smart-schedule-manager.replit.app
- 管理員可在網頁上設定排班表
- 員工可在網頁上查看自己的班表

注意事項：
- 必須在場館範圍內才能打卡成功
- 系統會顯示您與場館的距離
- 如果打卡失敗，請確認：
  1. GPS 是否已開啟
  2. 是否在正確的場館位置
  3. LINE 是否有位置權限
- 非中國信託帳戶的薪資轉帳會產生手續費`,
  quickReplies: [
    { label: '📍 打卡教學', text: '@小幫手 打卡系統怎麼用？' },
    { label: '🔗 開排班系統', text: '@小幫手 排班系統的網址是什麼？' },
  ],
};
