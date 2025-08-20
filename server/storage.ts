import { 
  messages, tasks, admins, auditLogs,
  type IMessage, type ITask, type IAdmin, type IAuditLog,
  type CreateMessageData, type CreateTaskData, type CreateAdminData, type CreateAuditLogData
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";

export interface IStorage {
  // Messages
  insertMessage(data: CreateMessageData): Promise<IMessage>;
  getMessageById(id: number): Promise<IMessage | null>;
  getMessageByMessageId(messageId: string): Promise<IMessage | null>;
  getMessages(filters: {
    q?: string;
    start?: Date;
    end?: Date;
    sourceType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ messages: IMessage[]; total: number }>;
  getRecentMessages(groupId: string, limit: number): Promise<IMessage[]>;

  // Tasks
  insertTask(data: CreateTaskData): Promise<ITask>;
  getTaskById(id: number): Promise<ITask | null>;
  getTasksByGroupId(groupId: string, status?: string): Promise<ITask[]>;
  getTaskByGroupAndSerial(groupId: string, taskSerial: string): Promise<ITask | null>;
  updateTaskStatus(id: number, status: string, completedAt?: Date): Promise<ITask | null>;
  getNextTaskSerial(groupId: string): Promise<string>;
  getTasksCreatedBetween(groupId: string, start: Date, end: Date, status?: string): Promise<ITask[]>;

  // Admins
  insertAdmin(data: CreateAdminData): Promise<IAdmin>;
  getAdmin(userId: string): Promise<IAdmin | null>;
  isAdmin(userId: string): Promise<boolean>;

  // Audit Logs
  insertAuditLog(data: CreateAuditLogData): Promise<IAuditLog>;
  getAuditLogs(limit?: number): Promise<IAuditLog[]>;
}

export class DatabaseStorage implements IStorage {
  // Messages
  async insertMessage(data: CreateMessageData): Promise<IMessage> {
    const [message] = await db.insert(messages).values(data).returning();
    return message as IMessage;
  }

  async getMessageById(id: number): Promise<IMessage | null> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message ? (message as IMessage) : null;
  }

  async getMessageByMessageId(messageId: string): Promise<IMessage | null> {
    const [message] = await db.select().from(messages).where(eq(messages.messageId, messageId));
    return message ? (message as IMessage) : null;
  }

  async getMessages(filters: {
    q?: string;
    start?: Date;
    end?: Date;
    sourceType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ messages: IMessage[]; total: number }> {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 50, 200);
    const offset = (page - 1) * pageSize;

    let whereConditions = [];
    
    if (filters.start) {
      whereConditions.push(gte(messages.timestamp, filters.start));
    }
    if (filters.end) {
      whereConditions.push(lte(messages.timestamp, filters.end));
    }
    if (filters.sourceType && filters.sourceType !== 'all') {
      whereConditions.push(eq(messages.sourceType, filters.sourceType));
    }
    // Note: Full-text search would need PostgreSQL-specific implementation
    // For now, we'll implement basic text search on the text field
    if (filters.q) {
      whereConditions.push(sql`${messages.text} ILIKE ${'%' + filters.q + '%'}`);
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [messagesResult, totalResult] = await Promise.all([
      db.select().from(messages)
        .where(whereClause)
        .orderBy(desc(messages.timestamp))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: count() }).from(messages).where(whereClause)
    ]);

    return {
      messages: messagesResult as IMessage[],
      total: totalResult[0].count
    };
  }

  async getRecentMessages(groupId: string, limit: number): Promise<IMessage[]> {
    const messagesResult = await db.select().from(messages)
      .where(eq(messages.groupId, groupId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
    
    return messagesResult as IMessage[];
  }

  // Tasks
  async insertTask(data: CreateTaskData): Promise<ITask> {
    const taskData = {
      ...data,
      context: data.context || []
    };
    const [task] = await db.insert(tasks).values(taskData).returning();
    return task as ITask;
  }

  async getTaskById(id: number): Promise<ITask | null> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task ? (task as ITask) : null;
  }

  async getTasksByGroupId(groupId: string, status?: string): Promise<ITask[]> {
    let whereConditions = [eq(tasks.groupId, groupId)];
    if (status) {
      whereConditions.push(eq(tasks.status, status));
    }

    const tasksResult = await db.select().from(tasks)
      .where(and(...whereConditions))
      .orderBy(tasks.taskSerial);
    
    return tasksResult as ITask[];
  }

  async getTaskByGroupAndSerial(groupId: string, taskSerial: string): Promise<ITask | null> {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.groupId, groupId), eq(tasks.taskSerial, taskSerial)));
    return task ? (task as ITask) : null;
  }

  async updateTaskStatus(id: number, status: string, completedAt?: Date): Promise<ITask | null> {
    const updateData: any = { status };
    if (completedAt) {
      updateData.completedAt = completedAt;
    }

    const [task] = await db.update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .returning();
    
    return task ? (task as ITask) : null;
  }

  async getNextTaskSerial(groupId: string): Promise<string> {
    // 找到該群組中最大的任務編號
    const [lastTask] = await db.select({ taskSerial: tasks.taskSerial })
      .from(tasks)
      .where(eq(tasks.groupId, groupId))
      .orderBy(desc(tasks.taskSerial))
      .limit(1);
    
    const lastSerial = lastTask ? parseInt(lastTask.taskSerial) : 0;
    const nextNumber = lastSerial + 1;
    
    return nextNumber.toString().padStart(2, '0');
  }

  async getTasksCreatedBetween(
    groupId: string, 
    start: Date, 
    end: Date, 
    status?: string
  ): Promise<ITask[]> {
    let whereConditions = [
      eq(tasks.groupId, groupId),
      gte(tasks.createdAt, start),
      lte(tasks.createdAt, end)
    ];
    
    if (status) {
      whereConditions.push(eq(tasks.status, status));
    }

    const tasksResult = await db.select().from(tasks)
      .where(and(...whereConditions))
      .orderBy(tasks.taskSerial);
    
    return tasksResult as ITask[];
  }

  // Admins
  async insertAdmin(data: CreateAdminData): Promise<IAdmin> {
    const [admin] = await db.insert(admins).values(data).returning();
    return admin as IAdmin;
  }

  async getAdmin(userId: string): Promise<IAdmin | null> {
    const [admin] = await db.select().from(admins).where(eq(admins.userId, userId));
    return admin ? (admin as IAdmin) : null;
  }

  async isAdmin(userId: string): Promise<boolean> {
    const admin = await this.getAdmin(userId);
    return !!admin;
  }

  // Audit Logs
  async insertAuditLog(data: CreateAuditLogData): Promise<IAuditLog> {
    try {
      const [log] = await db.insert(auditLogs).values(data).returning();
      return log as IAuditLog;
    } catch (error) {
      console.error('插入審計日誌失敗:', error);
      // 在開發模式下允許失敗
      if (process.env.NODE_ENV === 'development') {
        return {
          id: Math.floor(Math.random() * 1000000),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        } as IAuditLog;
      }
      throw error;
    }
  }

  async getAuditLogs(limit = 100): Promise<IAuditLog[]> {
    try {
      const logsResult = await db.select().from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
      
      return logsResult as IAuditLog[];
    } catch (error) {
      console.error('獲取審計日誌失敗:', error);
      if (process.env.NODE_ENV === 'development') {
        return [];
      }
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();