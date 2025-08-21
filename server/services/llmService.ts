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

身為專業的員工助理，請遵循以下規則：
1. 最近 5 則訊息為主要分析內容，前 5-15 則訊息作為補充參考
2. 只萃取明確的行動項目，不包含閒聊或討論
3. 將相似或重複的任務合併
4. 任務描述要具體可執行，符合職場專業標準
5. 保持原始語言（繁體中文）
6. 每個任務用一句話描述，語調專業友善

請以 JSON 格式回傳結果：
{
  "tasks": [
    {"text": "具體任務描述"},
    {"text": "另一個任務描述"}
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o-mini" which was released for cost-effective usage. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "您是駿斯小助理，一位專業的員工助理。您擅長從群組對話中萃取可執行的代辦事項，協助團隊提高工作效率。您的回應專業、友善且具建設性。"
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

      return result.tasks?.map((task: any) => task.text).filter(Boolean) || [];

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