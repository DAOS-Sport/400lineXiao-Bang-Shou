import mongoose from 'mongoose';

// 使用 MongoDB 格式的連接字串，預設值為本地開發用
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/line_secretary';

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI 必須設定');
}

export async function connectMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB 連接成功');
    return true;
  } catch (error) {
    console.error('MongoDB 連接失敗:', error);
    
    if (process.env.NODE_ENV === 'development') {
      console.warn('開發模式下允許繼續運行，但訊息將不會持久化存储');
      return false;
    } else {
      process.exit(1);
    }
  }
}

export { mongoose };