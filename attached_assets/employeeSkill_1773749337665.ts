# 駿斯小助理 AI 智能客服 — 開發規範

## 核心原則

1. **不動既有模組** — 絕對不修改 `ai-agent/` 目錄以外的現有 service 檔案
2. **唯讀操作** — 所有 tool handler 只能讀取資料，禁止寫入/修改/刪除
3. **繁體中文** — 所有 skill 描述、system prompt、回覆訊息一律使用繁體中文
4. **可擴充** — 新增功能只需新增 skill 檔案 + 註冊一行，不需改動核心邏輯

---

## 架構概覽

```
用戶: @小幫手 打卡系統怎麼用？
         ↓
routes.ts（@小幫手 前綴檢查）
         ↓
aiAgentService.ts（核心代理服務）
    ├── 權限檢查（interviewAuthorizedUsers.canUseAiAgent）
    ├── Rate Limiting（每人每 15 分鐘 10 次）
    ├── Gemini 2.5 Flash（主要）/ GPT-4o（備援）
    ├── Skill Registry → 自動組合 System Prompt + Function Calling
    └── 回覆用戶（含 Quick Reply 按鈕）
```

---

## Skill 分類

| 類別 | category 值 | 說明 |
|------|------------|------|
| 內部模組 | `'internal'` | 內建在 400 小幫手中的功能，可在 LINE 聊天中直接操作 |
| 外部系統 | `'external'` | 獨立部署在 Replit 上的外部子系統 |

---

## 新增內部模組 Skill

1. 在 `skills/` 目錄新建 `xxxSkill.ts`
2. 設定 `category: 'internal'`
3. 實作 `Skill` 介面（id, name, category, description, keywords, usage）
4. 如有即時查詢需求，在 `tools` 中定義查詢工具（handler 必須唯讀）
5. 在 `quickReplies` 中定義相關的快速按鈕
6. 在 `skillRegistry.ts` 中 import 並呼叫 `skillRegistry.register(xxxSkill)`
7. 完成 — system prompt 和 function calling 會自動更新

---

## 新增外部系統 Skill

1. 在 `skills/` 目錄新建 `xxxSkill.ts`
2. 設定 `category: 'external'`
3. 填入 `externalUrl`（系統網址）
4. 設定 `status: 'active'` 或 `'coming-soon'`
5. 將該外部系統的完整操作流程寫入 `description` 和 `usage`
6. 如果有 API 可查詢，在 `tools` 中定義查詢工具
7. 在 `quickReplies` 中定義相關的快速按鈕
8. 在 `skillRegistry.ts` 中 import 並呼叫 `skillRegistry.register(xxxSkill)`
9. 完成

---

## Skill 檔案範本（外部系統）

```typescript
import type { Skill } from '../types';

export const xxxSkill: Skill = {
  id: 'xxx',
  name: 'XXX系統',
  category: 'external',
  externalUrl: 'https://xxx.replit.app',
  status: 'active',  // 或 'coming-soon'
  description: '系統功能的完整中文描述...',
  keywords: ['關鍵字1', '關鍵字2'],
  usage: `【XXX系統使用方式】

操作流程：
1. 步驟一...
2. 步驟二...

注意事項：
- 注意事項一...`,
  quickReplies: [
    { label: '📖 使用教學', text: '@小幫手 XXX系統怎麼用？' },
    { label: '🔗 開啟系統', text: '@小幫手 XXX系統的網址是什麼？' },
  ],
};
```

---

## Skill 檔案範本（內部模組，含查詢工具）

```typescript
import type { Skill } from '../types';
import { db } from '../../../db';

export const xxxSkill: Skill = {
  id: 'xxx',
  name: 'XXX模組',
  category: 'internal',
  description: '模組功能的完整中文描述...',
  keywords: ['關鍵字1', '關鍵字2'],
  usage: `【XXX模組使用方式】

指令格式：
- xxx 參數 → 執行某操作`,
  quickReplies: [
    { label: '🔍 查詢', text: '@小幫手 查詢XXX' },
  ],
  tools: [
    {
      name: 'query_xxx',
      description: '查詢XXX資料',
      parameters: {
        keyword: { type: 'string', description: '查詢關鍵字' },
      },
      handler: async (args: Record<string, unknown>) => {
        try {
          // 唯讀查詢邏輯
          return '查詢結果...';
        } catch (error) {
          return `查詢失敗: ${(error as Error).message}`;
        }
      },
    },
  ],
};
```

---

## Function Calling Tool 規範

- handler 必須是 `async` 函數
- 必須有 `try-catch` 錯誤處理
- 回傳值必須是 `string`
- **禁止任何寫入、修改、刪除操作**
- 查詢結果應簡潔明瞭，適合 AI 整理後回覆用戶

---

## Quick Reply 規範

- `label` 最多 20 個字元（LINE 限制）
- `text` 必須以 `@小幫手 ` 開頭，這樣點擊後會自動觸發下一輪 AI 對話
- 每個 skill 建議 1-3 個 Quick Reply
- 系統會自動合併所有相關 skill 的 Quick Reply，最多 13 個（LINE 限制）

---

## 權限管理

- 新增用戶：在 `interviewAuthorizedUsers` 表設定 `canUseAiAgent = 'true'`
- 停用用戶：設定 `canUseAiAgent = 'false'`
- 權限檢查邏輯在 `aiAgentService.ts` 的 `isAuthorizedForAiAgent()` 方法

---

## 環境變數

| 變數名稱 | 用途 | 設定位置 |
|---------|------|---------|
| `GEMINI_API_KEY` | Gemini 2.5 Flash API Key（主要模型） | Replit Secrets |
| `OPENAI_API_KEY` | GPT-4o API Key（備援模型） | Replit Secrets（已存在） |

---

## 目前已註冊的 Skills

### 內部模組
| ID | 名稱 | 有查詢工具 |
|----|------|-----------|
| `task` | 交辦系統 | ✅ `query_pending_tasks` |
| `interview` | 面試檢核 | — |
| `water-quality` | 水質監控 | — |
| `weather` | 天氣預報 | — |
| `employee` | 員工查詢 | — |
| `survey` | 問卷調查 | — |
| `system` | 系統總覽 | — |

### 外部系統
| ID | 名稱 | 狀態 | 網址 |
|----|------|------|------|
| `clock-in` | 排班打卡系統 | ✅ 已上線 | https://smart-schedule-manager.replit.app |

---

## 測試注意事項

1. 新增 skill 後務必測試 `@小幫手` 是否正常回覆
2. 確認不影響現有指令（面試、交辦、id 等）
3. 外部系統 skill 確認網址正確、描述完整
4. 確認 Quick Reply 按鈕文字不超過 20 字元
5. 確認 tool handler 只有唯讀操作

---

## 常見問題

**Q: AI 客服沒有回覆怎麼辦？**
A: 檢查 Replit Secrets 中的 `GEMINI_API_KEY` 和 `OPENAI_API_KEY` 是否正確設定。

**Q: 怎麼新增一個外部系統？**
A: 參照上方「新增外部系統 Skill」的步驟，只需新建一個 skill 檔案 + 在 skillRegistry.ts 加一行註冊即可。

**Q: 怎麼讓更多用戶使用 AI 客服？**
A: 在資料庫的 `interview_authorized_users` 表中，將該用戶的 `can_use_ai_agent` 設為 `'true'`。
