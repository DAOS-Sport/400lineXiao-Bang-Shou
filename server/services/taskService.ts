import { storage } from "../storage";
import { type IMessage, type CreateTaskData } from "@shared/schema";
import { messageService } from "./messageService";

export class TaskService {
  async createTaskFromMessage(message: IMessage, text: string): Promise<void> {
    try {
      if (!message.groupId) {
        throw new Error('只能在群組中建立任務');
      }

      // 清理任務文字
      const cleanText = messageService.cleanTaskText(text);
      if (!cleanText) {
        throw new Error('任務內容不能為空');
      }

      // 取得下一個流水號
      const taskSerial = await storage.getNextTaskSerial(message.groupId);

      // 建立任務
      const taskData: CreateTaskData = {
        id: crypto.randomUUID(),
        groupId: message.groupId,
        taskIdSerial: taskSerial, // 匹配正確欄位名
        authorUserId: message.userId, // 匹配正確欄位名
        authorDisplayName: message.displayName || message.userId, // 匹配正確欄位名並處理 null
        text: cleanText, // 匹配正確欄位名
        status: 'pending',
        sourceMessageIds: [message.messageId] // 匹配正確欄位名
      };

      await storage.insertTask(taskData);

      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'webhook',
        message: '自動建立交辦任務',
        details: {
          groupId: message.groupId,
          taskSerial,
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
}

export const taskService = new TaskService();