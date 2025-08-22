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
        return '謝謝您的辛勞！任務完成辛苦了！';
      }

      const prompt = `根據以下已完成的任務內容，生成一句溫馨的感謝回應：

任務內容: ${taskText.substring(0, 100)}

要求：
1. 根據任務難易度和重要性調整感謝語氣
2. 使用溫暖正面的表達
3. 控制在20字以內
4. 使用繁體中文
5. 體現團隊合作精神

範例：
- 簡單任務："謝謝您！效率超讚！"
- 複雜任務："辛苦了！這個任務處理得很棒！"  
- 重要任務："太感謝了！公司有您真好！"

請直接回覆感謝語句，不要包含其他說明。`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 50
      });

      const message = response.choices[0]?.message?.content?.trim();
      
      if (message && message.length <= 30) {
        return message;
      } else {
        return '謝謝您！任務完成辛苦了！';
      }
      
    } catch (error) {
      console.error('❌ 生成完成訊息失敗:', error);
      return '謝謝您！任務完成辛苦了！';
    }
  }
}

export const taskService = new TaskService();