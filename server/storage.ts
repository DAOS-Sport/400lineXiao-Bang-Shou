import { 
  Message, Task, Admin, AuditLog, 
  type IMessage, type ITask, type IAdmin, type IAuditLog,
  type CreateMessageData, type CreateTaskData, type CreateAdminData, type CreateAuditLogData
} from "@shared/schema";

function convertMessage(obj: any): IMessage {
  return {
    ...obj,
    _id: obj._id.toString(),
    groupId: obj.groupId || undefined,
    roomId: obj.roomId || undefined,
    displayName: obj.displayName || undefined,
    text: obj.text || undefined
  };
}

function convertTask(obj: any): ITask {
  return {
    ...obj,
    _id: obj._id.toString(),
    creatorName: obj.creatorName || undefined,
    completedAt: obj.completedAt || undefined
  };
}

function convertAdmin(obj: any): IAdmin {
  return {
    ...obj,
    _id: obj._id.toString()
  };
}

function convertAuditLog(obj: any): IAuditLog {
  return {
    ...obj,
    _id: obj._id.toString(),
    details: obj.details || undefined
  };
}

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

  // Admins
  insertAdmin(data: CreateAdminData): Promise<IAdmin>;
  getAdmin(userId: string): Promise<IAdmin | null>;
  isAdmin(userId: string): Promise<boolean>;

  // Audit Logs
  insertAuditLog(data: CreateAuditLogData): Promise<IAuditLog>;
  getAuditLogs(limit?: number): Promise<IAuditLog[]>;
}

export class MongoStorage implements IStorage {
  // Messages
  async insertMessage(data: CreateMessageData): Promise<IMessage> {
    const message = new Message(data);
    await message.save();
    return convertMessage(message.toObject());
  }

  async getMessageById(id: string): Promise<IMessage | null> {
    const message = await Message.findById(id);
    return message ? convertMessage(message.toObject()) : null;
  }

  async getMessageByMessageId(messageId: string): Promise<IMessage | null> {
    const message = await Message.findOne({ messageId });
    return message ? convertMessage(message.toObject()) : null;
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
    const skip = (page - 1) * pageSize;

    const query: any = {};
    
    if (filters.q) {
      query.$text = { $search: filters.q };
    }
    if (filters.start) {
      query.timestamp = { ...query.timestamp, $gte: filters.start };
    }
    if (filters.end) {
      query.timestamp = { ...query.timestamp, $lte: filters.end };
    }
    if (filters.sourceType && filters.sourceType !== 'all') {
      query.sourceType = filters.sourceType;
    }

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Message.countDocuments(query)
    ]);

    return {
      messages: messages.map(convertMessage),
      total
    };
  }

  async getRecentMessages(groupId: string, limit: number): Promise<IMessage[]> {
    const messages = await Message.find({ groupId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    return messages.map(convertMessage);
  }

  // Tasks
  async insertTask(data: CreateTaskData): Promise<ITask> {
    const task = new Task(data);
    await task.save();
    return convertTask(task.toObject());
  }

  async getTaskById(id: string): Promise<ITask | null> {
    const task = await Task.findById(id);
    return task ? convertTask(task.toObject()) : null;
  }

  async getTasksByGroupId(groupId: string, status?: string): Promise<ITask[]> {
    const query: any = { groupId };
    if (status) {
      query.status = status;
    }

    const tasks = await Task.find(query)
      .sort({ taskSerial: 1 })
      .lean();
    
    return tasks.map(convertTask);
  }

  async getTaskByGroupAndSerial(groupId: string, taskSerial: string): Promise<ITask | null> {
    const task = await Task.findOne({ groupId, taskSerial });
    return task ? convertTask(task.toObject()) : null;
  }

  async updateTaskStatus(id: string, status: string, completedAt?: Date): Promise<ITask | null> {
    const updateData: any = { status };
    if (completedAt) {
      updateData.completedAt = completedAt;
    }

    const task = await Task.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    );
    
    return task ? convertTask(task.toObject()) : null;
  }

  async getNextTaskSerial(groupId: string): Promise<string> {
    // 找到該群組中最大的任務編號
    const lastTask = await Task.findOne({ groupId })
      .sort({ taskSerial: -1 })
      .lean();
    
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
    const query: any = {
      groupId,
      createdAt: {
        $gte: start,
        $lte: end
      }
    };
    
    if (status) {
      query.status = status;
    }

    const tasks = await Task.find(query)
      .sort({ taskSerial: 1 })
      .lean();
    
    return tasks.map(convertTask);
  }

  // Admins
  async insertAdmin(data: CreateAdminData): Promise<IAdmin> {
    const admin = new Admin(data);
    await admin.save();
    return convertAdmin(admin.toObject());
  }

  async getAdmin(userId: string): Promise<IAdmin | null> {
    const admin = await Admin.findOne({ userId });
    return admin ? convertAdmin(admin.toObject()) : null;
  }

  async isAdmin(userId: string): Promise<boolean> {
    const admin = await this.getAdmin(userId);
    return !!admin;
  }

  // Audit Logs
  async insertAuditLog(data: CreateAuditLogData): Promise<IAuditLog> {
    try {
      const log = new AuditLog(data);
      await log.save();
      return convertAuditLog(log.toObject());
    } catch (error) {
      console.error('插入審計日誌失敗:', error);
      // 在開發模式下允許失敗
      if (process.env.NODE_ENV === 'development') {
        return {
          _id: 'dev-log-' + Date.now(),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      throw error;
    }
  }

  async getAuditLogs(limit = 100): Promise<IAuditLog[]> {
    try {
      const logs = await AuditLog.find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      
      return logs.map(convertAuditLog);
    } catch (error) {
      console.error('獲取審計日誌失敗:', error);
      if (process.env.NODE_ENV === 'development') {
        return [];
      }
      throw error;
    }
  }
}

export const storage = new MongoStorage();