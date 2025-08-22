import { storage } from "../storage";
import { type IMessage, type CreateTaskData } from "@shared/schema";
import { messageService } from "./messageService";
import { llmService } from "./llmService";
import crypto from "crypto";
import OpenAI from "openai";

export class TaskService {
  async createTaskFromMessage(message: IMessage, text: string): Promise<void> {
    try {
      if (!message.groupId) {
        throw new Error('只能在群組中建立任務');
      }

      // 清理任務文字
      let cleanText = messageService.cleanTaskText(text);
      if (!cleanText) {
        throw new Error('任務內容不能為空');
      }

      // 🎯 檢查是否為長任務（超過200字符），使用 GPT 整理
      const isLongTask = cleanText.length > 200;
      let finalTaskText = cleanText;
      
      if (isLongTask) {
        console.log(`📝 檢測到長任務(${cleanText.length}字)，開始 GPT 整理...`);
        
        try {
          // 使用 GPT 整理長任務內容
          const organizedTask = await llmService.organizeTaskContent(cleanText);
          if (organizedTask && organizedTask.trim().length > 0) {
            finalTaskText = organizedTask.trim();
            console.log(`✨ GPT 整理完成: ${cleanText.length}字 → ${finalTaskText.length}字`);
            
            // 記錄整理過程
            await storage.insertAuditLog({
              id: crypto.randomUUID(),
              level: 'info',
              category: 'llm',
              message: '長任務內容已由 GPT 整理',
              details: {
                originalLength: cleanText.length,
                organizedLength: finalTaskText.length,
                groupId: message.groupId,
                messageId: message.messageId
              }
            });
          } else {
            console.warn('⚠️ GPT 整理結果為空，使用原始內容');
          }
        } catch (error) {
          console.warn('⚠️ GPT 整理失敗，使用原始內容:', error);
          // 繼續使用原始內容，不中斷任務創建流程
        }
      }

      // 檢查是否存在相似的近期任務（防重複）
      const recentTasks = await this.getRecentSimilarTasks(message.groupId, finalTaskText);
      if (recentTasks.length > 0) {
        console.log(`⚠️ 發現相似任務，跳過創建: ${recentTasks[0].taskIdSerial}`);
        return;
      }

      // 建立任務 (流水號會在 insertTask 內自動產生，確保原子性)
      const taskData: CreateTaskData = {
        id: crypto.randomUUID(),
        groupId: message.groupId,
        taskIdSerial: '', // 這個值會在 insertTask 內被覆蓋
        authorUserId: message.userId, // 匹配正確欄位名
        authorDisplayName: message.displayName || message.userId, // 匹配正確欄位名並處理 null
        text: finalTaskText, // 使用整理後的內容
        status: 'pending',
        sourceMessageIds: [message.messageId] // 匹配正確欄位名
      };

      const createdTask = await storage.insertTask(taskData);

      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'webhook',
        message: '自動建立交辦任務',
        details: {
          groupId: message.groupId,
          taskSerial: createdTask.taskIdSerial,
          description: cleanText,
          createdBy: message.userId
        }
      });

    } catch (error: any) {
      console.error('建立任務失敗:', error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'webhook',
        message: '建立任務失敗',
        details: {
          error: error.message,
          messageId: message.messageId,
          groupId: message.groupId
        }
      });
      throw error;
    }
  }

  async getOpenTasksByGroup(groupId: string): Promise<any[]> {
    const tasks = await storage.getTasksByGroupId(groupId, 'pending');
    return tasks.map(task => ({
      serial: task.taskIdSerial, // 匹配正確欄位名
      description: task.text, // 匹配正確欄位名
      creator: task.authorDisplayName || task.authorUserId, // 匹配正確欄位名
      createdAt: task.createdAt
    }));
  }

  async markTaskCompleted(groupId: string, taskSerial: string): Promise<boolean> {
    const task = await storage.getTaskByGroupAndSerial(groupId, taskSerial);
    if (!task || task.status === 'completed') {
      return false;
    }

    await storage.updateTaskStatus(task.id, 'completed', new Date());
    return true;
  }

  // 檢查是否存在相似的近期任務（防重複）
  private async getRecentSimilarTasks(groupId: string, taskText: string): Promise<any[]> {
    // 獲取該群組最近10分鐘內的任務
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentTasks = await storage.getTasksCreatedBetween(groupId, tenMinutesAgo, new Date(), 'pending');
    
    // 簡單的相似度檢查：如果前50個字符高度相似，視為重複
    const taskPrefix = taskText.substring(0, 50).toLowerCase();
    
    return recentTasks.filter(task => {
      const existingPrefix = task.text.substring(0, 50).toLowerCase();
      return this.calculateSimilarity(taskPrefix, existingPrefix) > 0.8;
    });
  }

  // 簡單的字符串相似度計算
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  // Levenshtein 距離算法
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // 根據群組和任務序號完成任務
  async completeTaskBySerial(groupId: string, taskSerial: string, userId: string): Promise<boolean> {
    try {
      // 查找該群組的特定序號任務
      const tasks = await storage.getTasksByGroupId(groupId, 'pending');
      const task = tasks.find(t => t.taskIdSerial === taskSerial);
      
      if (!task) {
        console.log(`❌ 找不到群組 ${groupId} 的任務 ${taskSerial}`);
        return false;
      }

      // 標記為完成
      await storage.updateTaskStatus(task.id, 'completed', new Date());
      
      // 記錄完成操作
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'task',
        message: '任務標記完成',
        details: {
          groupId,
          taskSerial,
          completedBy: userId,
          taskDescription: task.text.substring(0, 50) + (task.text.length > 50 ? '...' : '')
        }
      });

      console.log(`✅ 任務 ${taskSerial} 已完成，由 ${userId} 標記`);
      return true;
      
    } catch (error) {
      console.error(`❌ 完成任務失敗:`, error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'task',
        message: '任務完成標記失敗',
        details: { 
          error: (error as Error).message,
          groupId,
          taskSerial,
          userId
        }
      });
      return false;
    }
  }

  // 生成任務完成的溫馨回應
  async generateCompletionMessage(taskText: string): Promise<string> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return this.getRandomThankYouMessage();
      }

      const prompt = `根據以下已完成的任務內容，生成一句霸道總裁風格的讚賞回應：

任務內容: ${taskText.substring(0, 100)}

要求：
1. 使用霸道總裁語氣，自信、讚賞、有威嚴但不失溫度
2. 字數控制在25-40字之間，比較有份量感
3. 根據任務類型給出相對應的評價
4. 體現任務完成的具體價值和意義
5. 使用繁體中文，語氣要霸氣但正面

霸道總裁風格範例：
- 打掃類："很好，這種專業的執行力正是我要的。環境品質直接反映團隊水準，你做得相當出色。"
- 文件類："完美的整理能力，這種細緻度讓我刮目相看。有條理的工作正是高效率的關鍵。"
- 聯絡類："優秀的溝通協調，這種效率讓我很滿意。能快速解決問題的人才是我最需要的。"
- 確認類："非常謹慎的確認工作，這種嚴謹度符合我的標準。細節決定成敗，你證明了自己。"
- 收款類："款項處理得相當專業，這種精準度正是財務工作的核心。我對你的表現很滿意。"

請根據任務內容，生成一句霸道總裁風格的讚賞話語。語氣要自信、有威嚴但讚賞，字數25-40字。`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9, // 提高創造性
        max_tokens: 80
      });

      const message = response.choices[0]?.message?.content?.trim();
      
      if (message && message.length <= 45 && message.length >= 20) {
        return message;
      } else {
        return this.getRandomThankYouMessage();
      }
      
    } catch (error) {
      console.error('❌ 生成完成訊息失敗:', error);
      return this.getRandomThankYouMessage();
    }
  }

  // 備用的霸道總裁風格讚賞訊息（按任務類型分類）
  private getRandomThankYouMessage(): string {
    const messagesByType = {
      cleaning: [
        '很好，這種專業的執行力正是我要的。環境品質直接反映團隊水準，你做得相當出色。',
        '優秀的清潔工作，這種細緻度讓我刮目相看。完美的環境正是高效率的基礎。',
        '相當專業的打掃成果，這種品質符合我的標準。你證明了自己的專業能力。'
      ],
      document: [
        '完美的整理能力，這種細緻度讓我很滿意。有條理的工作正是高效率的關鍵。',
        '非常專業的文件處理，這種精準度符合我的要求。你的工作效率令我印象深刻。',
        '優秀的資料歸檔工作，這種系統性思維正是我需要的。你做得相當出色。'
      ],
      communication: [
        '優秀的溝通協調，這種效率讓我很滿意。能快速解決問題的人才是我最需要的。',
        '相當專業的聯絡工作，這種及時性符合我的標準。你證明了自己的執行力。',
        '很好的協調能力，這種溝通技巧正是團隊成功的關鍵。我對你的表現很滿意。'
      ],
      verification: [
        '非常謹慎的確認工作，這種嚴謹度符合我的標準。細節決定成敗，你證明了自己。',
        '優秀的核實能力，這種專業度讓我刮目相看。精確的工作正是品質的保證。',
        '相當專業的檢驗工作，這種細緻度符合我的要求。你的專業能力令我印象深刻。'
      ],
      general: [
        '出色的執行力，這種效率正是我要的。能快速完成任務的人才是團隊的核心。',
        '非常專業的工作成果，這種品質讓我很滿意。你證明了自己的價值和能力。',
        '優秀的任務完成度，這種專業水準符合我的標準。繼續保持這種卓越表現。',
        '相當出色的工作效率，這種執行力讓我刮目相看。你的表現超出了我的期待。',
        '很好的任務處理，這種專業度正是成功的關鍵。我對你的工作能力很滿意。',
        '完美的任務達成，這種品質符合我的要求。你用實力證明了自己的專業價值。'
      ]
    };
    
    // 隨機選擇一個分類，然後從該分類中隨機選一個訊息
    const categories = Object.keys(messagesByType);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const messages = messagesByType[randomCategory as keyof typeof messagesByType];
    const randomIndex = Math.floor(Math.random() * messages.length);
    
    return messages[randomIndex];
  }

  // 為特定群組生成任務摘要（供回覆觸發使用）
  async generateTaskSummaryForGroup(groupId: string): Promise<string> {
    try {
      console.log(`🚀 為群組 ${groupId} 生成任務摘要...`);
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      
      const todayEnd = new Date();
      
      // 獲取昨天+今天的未完成任務
      const tasks = await storage.getTasksByGroupId(groupId, 'pending');
      const relevantTasks = tasks.filter(task => 
        new Date(task.createdAt) >= yesterdayStart && 
        new Date(task.createdAt) <= todayEnd
      );
      
      let summary = '';
      
      if (relevantTasks.length === 0) {
        // 使用 GPT 生成勵志語
        const motivationalMessage = await this.getMotivationalQuote();
        summary = `目前沒有待處理的交辦事項，工作進度良好！\n\n${motivationalMessage}\n\n如果有新的任務需要處理，請使用「交辦」關鍵字。`;
      } else {
        summary = `📋 目前有 ${relevantTasks.length} 項待處理事項：\n\n`;
        
        relevantTasks.forEach((task, index) => {
          const createdDate = new Date(task.createdAt).toLocaleDateString('zh-TW', { 
            timeZone: 'Asia/Taipei',
            month: 'numeric',
            day: 'numeric'
          });
          
          summary += `${index + 1}. ${task.taskIdSerial} - ${task.text}\n`;
          summary += `   👤 交辦人：${task.authorDisplayName || task.authorUserId}\n`;
          summary += `   📅 建立：${createdDate}\n\n`;
        });
        
        // 使用 GPT 生成勵志語
        const motivationalMessage = await this.getMotivationalQuote();
        summary += `💡 ${motivationalMessage}\n\n`;
        summary += `如果交辦已完成，記得輸入「交辦XX完成」`;
      }
      
      console.log(`✅ 群組 ${groupId} 任務摘要生成成功`);
      return summary;
      
    } catch (error) {
      console.error(`❌ 生成群組 ${groupId} 任務摘要失敗:`, error);
      return '⚠️ 無法生成任務摘要，請稍後再試';
    }
  }

  // 獲取每日勵志語
  private async getMotivationalQuote(): Promise<string> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        // 備用固定勵志語
        const fallbackQuotes = [
          '今天也要加油！每個小進步都值得慶祝',
          '團隊合作，讓工作更有效率',
          '保持積極的態度，成功就在眼前',
          '每一項完成的任務都是向目標邁進的一步',
          '專注當下，做好每一件事'
        ];
        return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
      }
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // 使用最新模型
        messages: [
          {
            role: "system",
            content: "你是一個正向的工作助理。請生成一句20字以內的中文工作勵志語，要溫暖、正面、適合團隊工作環境。不要使用過於熱血或誇張的表達。"
          },
          {
            role: "user",
            content: "請給我一句今日工作勵志語"
          }
        ],
        max_tokens: 50,
        temperature: 0.8
      });
      
      const quote = response.choices[0]?.message?.content?.trim();
      return quote || '今天也要加油！每個小進步都值得慶祝';
      
    } catch (error) {
      console.warn('⚠️ 生成勵志語失敗，使用備用訊息:', error);
      const fallbackQuotes = [
        '今天也要加油！每個小進步都值得慶祝',
        '團隊合作，讓工作更有效率',
        '保持積極的態度，成功就在眼前'
      ];
      return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
    }
  }
}

export const taskService = new TaskService();