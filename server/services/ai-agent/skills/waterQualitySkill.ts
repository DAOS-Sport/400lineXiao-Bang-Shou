import type { Skill } from '../types';

export const waterQualitySkill: Skill = {
  id: 'water-quality',
  name: '水質監控',
  category: 'internal',
  description: '水質監控系統自動追蹤游泳池的水質數據（CL 氯氣、PH 酸鹼值、水溫、氣溫），每日自動生成報告。',
  keywords: ['水質', 'CL', 'PH', '氯', '酸鹼', '水溫', '氣溫', '溫度', '泳池'],
  usage: `【水質監控使用方式】

自動報告：
- 系統每日自動在指定群組發送水質報告
- 報告時間：13:00、17:30、20:30

監控指標：
- CL（氯氣含量）
- PH（酸鹼值）
- 水溫（°C）
- 氣溫（°C）

AI 水質分析：
- 每日 21:00 系統會使用 AI 分析當日水質數據
- 自動生成水質狀況評估和改善建議

適用群組：
- 竹科戶外游泳池群組
- 其他指定的泳池管理群組

水質記錄方式：
- 在群組中直接發送水質數據
- 系統會自動識別並記錄 CL、PH、溫度等數值`,
  quickReplies: [
    { label: '💧 水質說明', text: '@小幫手 水質監控怎麼用？' },
  ],
};
