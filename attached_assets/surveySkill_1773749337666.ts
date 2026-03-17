// AI 智能客服 — 類型定義

export interface Skill {
  id: string;                              // 唯一識別碼
  name: string;                            // 中文名稱
  category: 'internal' | 'external';       // 內部模組 or 外部系統
  description: string;                     // 中文功能描述（注入 system prompt）
  keywords: string[];                      // 關聯關鍵字
  usage: string;                           // 使用說明
  externalUrl?: string;                    // 外部系統網址（僅 external）
  status?: 'active' | 'coming-soon';       // 系統狀態（預設 active）
  tools?: SkillTool[];                     // function calling 工具
  quickReplies?: QuickReplyItem[];         // 此 skill 相關的 Quick Reply 按鈕
}

export interface SkillTool {
  name: string;                            // 工具名稱
  description: string;                     // 中文描述
  parameters: Record<string, unknown>;     // JSON Schema 參數定義
  handler: (args: Record<string, unknown>) => Promise<string>; // 執行函數（唯讀）
}

export interface QuickReplyItem {
  label: string;   // 按鈕文字（最多 20 字）
  text: string;    // 點擊後發送的文字
}

export interface AgentResponse {
  text: string;                  // AI 回覆文字
  quickReplies: QuickReplyItem[];  // 動態產生的快速按鈕
}
