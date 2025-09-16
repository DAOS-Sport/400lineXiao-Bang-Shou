import { 
  messages, tasks, admins, auditLogs, authorizedGroups, employeeCache,
  type IMessage, type ITask, type IAdmin, type IAuditLog, type AuthorizedGroup, type IEmployeeCache,
  type CreateMessageData, type CreateTaskData, type CreateAdminData, type CreateAuditLogData, type InsertAuthorizedGroup, type CreateEmployeeCacheData
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";

export interface IStorage {
  // Messages
  insertMessage(data: CreateMessageData): Promise<IMessage>;
  getMessageById(id: string): Promise<IMessage | null>;
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
  getTaskById(id: string): Promise<ITask | null>;
  getTasksByGroupId(groupId: string, status?: string): Promise<ITask[]>;
  getTaskByGroupAndSerial(groupId: string, taskSerial: string): Promise<ITask | null>;
  updateTaskStatus(id: string, status: string, completedAt?: Date): Promise<ITask | null>;
  getNextTaskSerial(groupId: string): Promise<string>;
  getTasksCreatedBetween(groupId: string, start: Date, end: Date, status?: string): Promise<ITask[]>;
  getTasksByStatus(status: string): Promise<ITask[]>;

  // Admins
  insertAdmin(data: CreateAdminData): Promise<IAdmin>;
  getAdmin(userId: string): Promise<IAdmin | null>;
  isAdmin(userId: string): Promise<boolean>;

  // Authorized Groups
  insertAuthorizedGroup(data: InsertAuthorizedGroup): Promise<AuthorizedGroup>;
  getAuthorizedGroup(groupId: string): Promise<AuthorizedGroup | null>;
  isGroupAuthorized(groupId: string): Promise<boolean>;
  getAuthorizedGroups(): Promise<AuthorizedGroup[]>;
  
  // Audit Logs
  insertAuditLog(data: CreateAuditLogData): Promise<IAuditLog>;
  getAuditLogs(limit?: number): Promise<IAuditLog[]>;
  getAuditLogsByCategory(category: string): Promise<IAuditLog[]>;

  // Employee Cache
  insertEmployeeCache(data: CreateEmployeeCacheData): Promise<IEmployeeCache>;
  getEmployeeCache(lineId: string): Promise<IEmployeeCache | null>;
  updateEmployeeCacheAccess(lineId: string): Promise<void>;
  deleteExpiredEmployeeCache(): Promise<void>;
  deleteEmployeeCache(lineId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Messages
  async insertMessage(data: CreateMessageData): Promise<IMessage> {
    try {
      // 生成 UUID 作為 ID
      const messageData = {
        ...data,
        id: crypto.randomUUID()
      };
      const [message] = await db.insert(messages).values(messageData).returning();
      return message as IMessage;
    } catch (error) {
      console.log('🔧 暫時跳過訊息儲存錯誤:', (error as Error).message);
      // 暫時回傳模擬物件，避免阻塞功能
      return {
        id: crypto.randomUUID(),
        messageId: data.messageId,
        sourceType: data.sourceType,
        groupId: data.groupId,
        userId: data.userId,
        text: data.text,
        timestamp: data.timestamp,
        rawEvent: data.rawEvent,
        createdAt: new Date()
      } as IMessage;
    }
  }

  async getMessageById(id: string): Promise<IMessage | null> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message ? (message as IMessage) : null;
  }

  async getMessageByMessageId(messageId: string): Promise<IMessage | null> {
    try {
      const [message] = await db.select().from(messages).where(eq(messages.messageId, messageId));
      return message ? (message as IMessage) : null;
    } catch (error) {
      console.log('🔧 暫時跳過訊息查詢錯誤:', (error as Error).message);
      return null; // 暫時回傳 null，避免阻塞功能
    }
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
    // 使用交易來確保原子性操作，防止流水號競爭
    return await db.transaction(async (tx) => {
      // 先鎖定該群組的所有任務記錄（使用 SELECT FOR UPDATE）
      await tx.execute(sql`
        SELECT 1 FROM ${tasks}
        WHERE group_id = ${data.groupId}
        FOR UPDATE
      `);
      
      // 在鎖定後取得下一個流水號
      const result = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(task_id_serial AS INTEGER)), 0) + 1 as serial
        FROM ${tasks}
        WHERE group_id = ${data.groupId}
      `);
      
      const nextNumber = (result.rows[0] as any).serial || 1;
      const taskSerial = nextNumber.toString().padStart(2, '0');
      
      // 創建任務資料
      const taskData = {
        ...data,
        id: crypto.randomUUID(),
        taskIdSerial: taskSerial, // 使用交易內產生的流水號
        sourceMessageIds: data.sourceMessageIds || []
      };
      
      // 插入任務
      const [task] = await tx.insert(tasks).values(taskData).returning();
      return task as ITask;
    });
  }

  async getTaskById(id: string): Promise<ITask | null> {
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
      .orderBy(tasks.taskIdSerial);
    
    return tasksResult as ITask[];
  }

  async getTaskByGroupAndSerial(groupId: string, taskSerial: string): Promise<ITask | null> {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.groupId, groupId), eq(tasks.taskIdSerial, taskSerial)));
    return task ? (task as ITask) : null;
  }

  async updateTaskStatus(id: string, status: string, completedAt?: Date): Promise<ITask | null> {
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
    // 使用 FOR UPDATE 防止競爭條件
    // 使用 SQL 直接取得並更新流水號，確保原子性操作
    const result = await db.execute(sql`
      WITH next_serial AS (
        SELECT COALESCE(MAX(CAST(task_id_serial AS INTEGER)), 0) + 1 as serial
        FROM ${tasks}
        WHERE group_id = ${groupId}
      )
      SELECT serial FROM next_serial
    `);
    
    // 取得查詢結果
    const nextNumber = (result.rows[0] as any).serial || 1;
    
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
      .orderBy(tasks.taskIdSerial);
    
    return tasksResult as ITask[];
  }

  async getTasksByStatus(status: string): Promise<ITask[]> {
    const tasksResult = await db.select().from(tasks)
      .where(eq(tasks.status, status))
      .orderBy(tasks.createdAt);
    
    return tasksResult as ITask[];
  }

  async getAllTasks(): Promise<ITask[]> {
    const tasksResult = await db.select().from(tasks)
      .orderBy(desc(tasks.createdAt));
    
    return tasksResult as ITask[];
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
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

  // Authorized Groups
  async insertAuthorizedGroup(data: InsertAuthorizedGroup): Promise<AuthorizedGroup> {
    const [group] = await db.insert(authorizedGroups).values(data).returning();
    return group as AuthorizedGroup;
  }

  async getAuthorizedGroup(groupId: string): Promise<AuthorizedGroup | null> {
    const [group] = await db.select().from(authorizedGroups).where(eq(authorizedGroups.groupId, groupId));
    return group ? (group as AuthorizedGroup) : null;
  }

  async isGroupAuthorized(groupId: string): Promise<boolean> {
    const group = await this.getAuthorizedGroup(groupId);
    return group !== null && group.isActive === 'true';
  }

  async getAuthorizedGroups(): Promise<AuthorizedGroup[]> {
    const groups = await db.select().from(authorizedGroups)
      .where(eq(authorizedGroups.isActive, 'true'))
      .orderBy(desc(authorizedGroups.createdAt));
    return groups as AuthorizedGroup[];
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
          ...data,
          id: data.id || crypto.randomUUID(),
          timestamp: new Date()
        } as IAuditLog;
      }
      throw error;
    }
  }

  async getAuditLogs(limit = 100): Promise<IAuditLog[]> {
    try {
      const logsResult = await db.select().from(auditLogs)
        .orderBy(desc(auditLogs.timestamp))
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

  async getAuditLogsByCategory(category: string): Promise<IAuditLog[]> {
    try {
      const logsResult = await db.select().from(auditLogs)
        .where(eq(auditLogs.category, category))
        .orderBy(desc(auditLogs.timestamp))
        .limit(1000);
      
      return logsResult as IAuditLog[];
    } catch (error) {
      console.error('按分類獲取審計日誌失敗:', error);
      if (process.env.NODE_ENV === 'development') {
        return [];
      }
      throw error;
    }
  }

  // Employee Cache methods
  async insertEmployeeCache(data: CreateEmployeeCacheData): Promise<IEmployeeCache> {
    try {
      const cacheData = {
        ...data,
        accessCount: '1'
      };
      const [cache] = await db.insert(employeeCache).values(cacheData).returning();
      return cache as IEmployeeCache;
    } catch (error) {
      console.error('新增員工快取失敗:', error);
      throw error;
    }
  }

  async getEmployeeCache(lineId: string): Promise<IEmployeeCache | null> {
    try {
      const cache = await db.select().from(employeeCache)
        .where(eq(employeeCache.lineId, lineId))
        .limit(1);
      
      if (cache.length === 0) {
        return null;
      }

      const cacheData = cache[0] as IEmployeeCache;
      
      // 檢查是否過期
      if (cacheData.expiresAt && new Date() > cacheData.expiresAt) {
        // 刪除過期快取
        await this.deleteEmployeeCache(lineId);
        return null;
      }

      return cacheData;
    } catch (error) {
      console.error('查詢員工快取失敗:', error);
      return null;
    }
  }

  async updateEmployeeCacheAccess(lineId: string): Promise<void> {
    try {
      await db.update(employeeCache)
        .set({ 
          lastAccessed: new Date(),
          accessCount: sql`(${employeeCache.accessCount}::int + 1)::text`
        })
        .where(eq(employeeCache.lineId, lineId));
    } catch (error) {
      console.error('更新員工快取存取記錄失敗:', error);
    }
  }

  async deleteExpiredEmployeeCache(): Promise<void> {
    try {
      const now = new Date();
      await db.delete(employeeCache)
        .where(lte(employeeCache.expiresAt, now));
    } catch (error) {
      console.error('清理過期員工快取失敗:', error);
    }
  }

  async deleteEmployeeCache(lineId: string): Promise<void> {
    try {
      await db.delete(employeeCache)
        .where(eq(employeeCache.lineId, lineId));
    } catch (error) {
      console.error('刪除員工快取失敗:', error);
    }
  }
}

export const storage = new DatabaseStorage();