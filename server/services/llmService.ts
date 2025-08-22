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

      const prompt = `您是駿斯小助理，一位專業的員工助理。請仔細分析以下群組對話記錄，只有在發現明確的行動需求時才萃取任務。

對話記錄：
${messageTexts}

⚠️ 重要指示：
1. 如果對話中沒有明確的任務或行動項目，請回傳空陣列 []
2. 不要憑空創造任務或使用模板化內容
3. 只萃取對話中真正提及的具體行動需求
4. **必須將相關、相似或可組合的任務整合為單一任務**
5. 避免建立重複或過於細分的任務

任務整合規則：
- 同一類型的工作應合併（如：清理相關表單、聯繫同一部門等）
- 連續的步驟應整合為完整流程
- 相同對象的多個動作應合併
- 使用「和」、「以及」、「包含」等詞彙整合相關項目

分析規則：
- 尋找明確的動作詞：需要、請、麻煩、處理、確認、聯繫等
- 識別具體對象：人名、部門、事項、時間、地點
- 排除純粹的討論、詢問、回應
- 每個真實任務用一句話簡潔但完整地描述

請以 JSON 格式回傳結果：
{
  "tasks": [
    {"text": "基於實際對話的具體且整合的任務描述"}
  ]
}

如果沒有找到真正的任務，請回傳：{"tasks": []}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o-mini" which was released for cost-effective usage. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "您是駿斯小助理，一位謹慎且專業的員工助理。您只會在對話中出現明確行動需求時才建立任務，絕不會憑空創造或使用模板內容。您會仔細區分真實任務和一般討論，並將相關事項整合為單一任務。"
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
        message: '駿斯小助理任務萃取成功',
        details: {
          messageCount: messages.length,
          extractedTasks: result.tasks?.length || 0,
          inputMessages: messageTexts.substring(0, 200) + '...',
          gptResponse: response.choices[0].message.content?.substring(0, 300) + '...'
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

  // 整理長任務內容
  async organizeTaskContent(taskText: string): Promise<string | null> {
    try {
      console.log(`🤖 開始整理長任務內容 (${taskText.length} 字符)`);

      const prompt = `請將以下交辦事項內容進行精簡整理，嚴格要求：
1. 總字數必須控制在 300 字以內
2. 保留最核心的重要信息，去除冗餘細節
3. 合併相似或重複的項目
4. 使用簡潔明瞭的表達
5. 保持專業的交辦語氣
6. 用簡短的條列式呈現

請整理以下內容（務必縮減至300字內）：
${taskText}

請直接回覆精簡後的內容，不要包含其他說明文字。`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const organizedContent = response.choices[0]?.message?.content?.trim();
      
      if (!organizedContent) {
        console.warn('⚠️ GPT 回覆為空');
        return null;
      }

      // 驗證字數限制，如果超過 300 字則進行二次精簡
      let finalContent = organizedContent;
      if (organizedContent.length > 300) {
        console.log(`⚠️ 內容仍超過 300 字 (${organizedContent.length}字)，進行二次精簡...`);
        
        const secondPrompt = `以下內容仍然太長，請進一步精簡至 250 字以內：
${organizedContent}

要求：
- 只保留最核心的關鍵信息
- 合併相同性質的項目
- 使用最簡短的表達
- 字數嚴格控制在 250 字內

請直接回覆精簡後的內容。`;

        try {
          const secondResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: secondPrompt }],
            temperature: 0.1,
            max_tokens: 500
          });

          const compactContent = secondResponse.choices[0]?.message?.content?.trim();
          if (compactContent && compactContent.length <= 300) {
            finalContent = compactContent;
            console.log(`✅ 二次精簡成功: ${organizedContent.length} → ${finalContent.length} 字符`);
          } else {
            console.warn(`⚠️ 二次精簡失敗，使用截斷方式`);
            finalContent = organizedContent.substring(0, 297) + '...';
          }
        } catch (error) {
          console.warn('⚠️ 二次精簡失敗，使用截斷方式:', error);
          finalContent = organizedContent.substring(0, 297) + '...';
        }
      }

      console.log(`✅ 任務整理完成: ${taskText.length} → ${finalContent.length} 字符 (${finalContent.length <= 300 ? '✅' : '❌'} 符合300字限制)`);
      
      // 記錄成功
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'llm',
        message: 'GPT 任務內容整理成功',
        details: {
          originalLength: taskText.length,
          organizedLength: finalContent.length,
          compressionRatio: ((taskText.length - finalContent.length) / taskText.length * 100).toFixed(1) + '%',
          withinLimit: finalContent.length <= 300,
          requiresSecondPass: organizedContent.length > 300
        }
      });

      return finalContent;

    } catch (error) {
      console.error('❌ GPT 任務整理失敗:', error);
      
      // 記錄錯誤
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'llm',
        message: 'GPT 任務內容整理失敗',
        details: {
          error: (error as Error).message,
          originalLength: taskText.length
        }
      });

      return null;
    }
  }
}

export const llmService = new LLMService();