import OpenAI from 'openai';
import { type IMessage } from "@shared/schema";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY 未設定，GPT 功能將無法使用');
}

export class LLMService {
  async extractTasksFromMessages(messages: IMessage[]): Promise<string[]> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY 未設定');
      }

      // 準備訊息內容，最近 5 則為主，檢查 5-15 則
      const recentMessages = messages.slice(0, 5);
      const olderMessages = messages.slice(5, 15);
      
      const messageTexts = messages
        .filter(m => m.text && m.text.trim())
        .map(m => {
          const time = new Date(m.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          const author = m.displayName || m.userId;
          return `[${time}] ${author}: ${m.text}`;
        })
        .join('\n');

      if (!messageTexts.trim()) {
        return [];
      }

      const prompt = `您是駿斯小助理，一位專業的員工助理。請分析以下群組對話記錄，萃取出可執行的代辦任務。

對話記錄：
${messageTexts}

身為專業的員工助理，請遵循以下分析原則：

**智能整合原則**：
- 重點分析最近 5 則訊息，參考前 5-15 則訊息
- **關鍵：識別同一主題的多次討論**（如：同一筆金額、同一客戶、同一事件）
- 將相關的多則訊息合併成單一任務，避免重複
- 例如：多則訊息討論 $32775 付款確認 → 合併成一個確認任務

**任務整合標準**：
- 相同金額、相同對象、相同事件 = 同一個任務
- 「確認」、「聯繫」、「處理」都是執行動作，不是分別任務
- 將所有相關資訊整合到一個清楚的任務描述中
- **重要：避免產生重複或相似的任務**

**輸出要求**：
- **務必將相關討論合併成單一任務**
- 每個任務包含完整資訊和30字內的處理建議
- 按優先級排序（緊急/重要的任務排前面）
- **寧可少而精確，不要多而重複**
- 使用繁體中文

請以 JSON 格式回傳結果：
{
  "tasks": [
    {
      "text": "具體任務描述", 
      "suggestion": "30字內處理建議"
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o-mini" which was released for cost-effective usage. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "您是駿斯小助理，專業的任務整合專家。您的核心能力是將多次相關討論合併成單一明確任務。請特別注意：同一主題的多次對話應整合為一個任務，而不是分別建立多個相似任務。您追求精準和效率。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1000
      });

      const result = JSON.parse(response.choices[0].message.content || '{"tasks":[]}');
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'llm',
        message: 'GPT 任務萃取成功',
        details: {
          messageCount: messages.length,
          extractedTasks: result.tasks?.length || 0
        }
      });

      // 處理新格式的回應（包含處理建議）
      if (result.tasks && Array.isArray(result.tasks)) {
        return result.tasks.map((task: any) => {
          if (typeof task === 'string') {
            return task; // 向後相容舊格式
          } else if (task.text && task.suggestion) {
            return `${task.text}｜建議：${task.suggestion}`; // 新格式：任務+建議
          } else if (task.text) {
            return task.text; // 只有任務描述
          }
          return null;
        }).filter(Boolean);
      }
      
      return [];

    } catch (error: any) {
      console.error('LLM 任務萃取失敗:', error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'llm',
        message: 'LLM 任務萃取失敗',
        details: { error: error.message }
      });
      
      // 降級處理：回傳空陣列
      return [];
    }
  }

  async organizeTasksForDailySummary(tasks: any[]): Promise<string> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY 未設定');
      }

      if (tasks.length === 0) {
        return '';
      }

      const taskTexts = tasks.map(task => `${task.serial}. ${task.description}`).join('\n');
      
      const prompt = `請整理以下代辦任務清單，合併重複項目、去除客套話、保留可執行的重點描述：

原始任務：
${taskTexts}

請遵循以下格式要求：
1. 合併重複或相似的任務
2. 保持編號順序
3. 每項任務一行
4. 使用繁體中文
5. 保留重要的時間、地點、負責人資訊
6. 移除不必要的客套話

請以純文字格式回傳，每行一個任務項目。`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o-mini" which was released for cost-effective usage. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "你是一個專業的任務整理助手，擅長整理和優化任務清單。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 800
      });

      const organizedTasks = response.choices[0].message.content?.trim() || taskTexts;
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'llm',
        message: 'GPT 任務整理成功',
        details: {
          originalTaskCount: tasks.length,
          organizedLength: organizedTasks.length
        }
      });

      return organizedTasks;

    } catch (error: any) {
      console.error('LLM 任務整理失敗:', error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'llm',
        message: 'LLM 任務整理失敗',
        details: { error: error.message }
      });
      
      // 降級處理：直接回傳原始任務列表
      return tasks.map(task => `${task.serial}. ${task.description}`).join('\n');
    }
  }

  async generateTaskSuggestions(tasks: any[]): Promise<string> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return '';
      }

      if (tasks.length === 0) {
        return '';
      }

      const taskTexts = tasks.map(task => `${task.serial}. ${task.description}`).join('\n');
      
      const prompt = `請為以下未完成的代辦任務提供簡潔的處理建議：

任務清單：
${taskTexts}

要求：
- 使用繁體中文
- 總字數控制在30字以內
- 提供最關鍵的處理提醒
- 包含優先順序或時間提醒
- 格式簡潔明瞭

範例：「優先處理，需準備整理工具，預計30分鐘完成。」`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o-mini" which was released for cost-effective usage. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "你是一個專業的任務管理顧問，擅長提供實用的任務處理建議和優先順序分析。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 100
      });

      const suggestions = response.choices[0].message.content?.trim() || '';
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'llm',
        message: 'GPT 任務建議生成成功',
        details: {
          taskCount: tasks.length,
          suggestionLength: suggestions.length
        }
      });

      return suggestions;

    } catch (error: any) {
      console.error('LLM 任務建議生成失敗:', error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'llm',
        message: 'LLM 任務建議生成失敗',
        details: { error: error.message }
      });
      
      return '';
    }
  }
}

export const llmService = new LLMService();