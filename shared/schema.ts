import mongoose from 'mongoose';

// Messages Schema - 訊息原始存證
const messageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true }, // LINE 事件 ID
  sourceType: { type: String, required: true, enum: ['user', 'group', 'room'] },
  groupId: { type: String }, // 群組 ID（如有）
  roomId: { type: String }, // Room ID（如有）
  userId: { type: String, required: true }, // 發話者 ID
  displayName: { type: String }, // 顯示名稱（可選）
  type: { type: String, required: true }, // text | image | file ...
  text: { type: String }, // 文字內容
  timestamp: { type: Date, required: true }, // ISO 時間戳，存台北時區
  rawEvent: { type: mongoose.Schema.Types.Mixed, required: true } // 原始 JSON 事件
}, {
  timestamps: true // 自動創建 createdAt, updatedAt
});

// 建立索引以提升查詢效能
messageSchema.index({ timestamp: -1 });
messageSchema.index({ groupId: 1 });
messageSchema.index({ userId: 1 });
messageSchema.index({ text: 'text' }); // 全文搜尋索引
messageSchema.index({ sourceType: 1 });

export const Message = mongoose.model('Message', messageSchema);

// Tasks Schema - 任務管理
const taskSchema = new mongoose.Schema({
  groupId: { type: String, required: true }, // 任務來源群組
  taskSerial: { type: String, required: true }, // 群組內的任務編號 (01, 02, ...)
  createdBy: { type: String, required: true }, // 建立任務的 userId
  creatorName: { type: String }, // 建立者顯示名稱
  description: { type: String, required: true }, // 任務內容
  status: { type: String, required: true, enum: ['pending', 'completed'], default: 'pending' },
  completedAt: { type: Date }, // 完成時間（如有）
  context: [{ type: String }] // 任務相關的對話片段 messageId
}, {
  timestamps: true
});

// 群組內任務編號唯一
taskSchema.index({ groupId: 1, taskSerial: 1 }, { unique: true });
taskSchema.index({ groupId: 1, status: 1 });
taskSchema.index({ createdAt: -1 });

export const Task = mongoose.model('Task', taskSchema);

// Admins Schema - 白名單 / 權限控管
const adminSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // LINE userId
  role: { type: String, required: true, enum: ['admin', 'member'], default: 'admin' }
}, {
  timestamps: true
});

export const Admin = mongoose.model('Admin', adminSchema);

// Audit Logs Schema - 稽核日誌
const auditLogSchema = new mongoose.Schema({
  level: { type: String, required: true, enum: ['info', 'warning', 'error'] },
  category: { type: String, required: true, enum: ['webhook', 'llm', 'scheduler', 'auth'] },
  message: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed } // 額外詳細資料
}, {
  timestamps: true
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ category: 1 });
auditLogSchema.index({ level: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// TypeScript 介面
export interface IMessage {
  _id: string;
  messageId: string;
  sourceType: 'user' | 'group' | 'room';
  groupId?: string;
  roomId?: string;
  userId: string;
  displayName?: string;
  type: string;
  text?: string;
  timestamp: Date;
  rawEvent: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITask {
  _id: string;
  groupId: string;
  taskSerial: string;
  createdBy: string;
  creatorName?: string;
  description: string;
  status: 'pending' | 'completed';
  completedAt?: Date;
  context: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdmin {
  _id: string;
  userId: string;
  role: 'admin' | 'member';
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuditLog {
  _id: string;
  level: 'info' | 'warning' | 'error';
  category: 'webhook' | 'llm' | 'scheduler' | 'auth';
  message: string;
  details?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageData {
  messageId: string;
  sourceType: 'user' | 'group' | 'room';
  groupId?: string;
  roomId?: string;
  userId: string;
  displayName?: string;
  type: string;
  text?: string;
  timestamp: Date;
  rawEvent: any;
}

export interface CreateTaskData {
  groupId: string;
  taskSerial: string;
  createdBy: string;
  creatorName?: string;
  description: string;
  status?: 'pending' | 'completed';
  context?: string[];
}

export interface CreateAdminData {
  userId: string;
  role?: 'admin' | 'member';
}

export interface CreateAuditLogData {
  level: 'info' | 'warning' | 'error';
  category: 'webhook' | 'llm' | 'scheduler' | 'auth';
  message: string;
  details?: any;
}
