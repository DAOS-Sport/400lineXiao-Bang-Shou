/**
 * Water Quality Memory Store - 水質記憶體存儲
 * 簡單的記憶體快取，用於存儲當日水質數據
 */

interface WaterQualityRecord {
  date: string;
  time: string;
  cl: number;
  ph: number;
  waterTemp: number;
  airTemp: number;
  messageId: string;
  userId: string;
}

class WaterQualityMemoryStore {
  private records: WaterQualityRecord[] = [];

  // 新增水質記錄
  addRecord(record: WaterQualityRecord): void {
    // 檢查是否已存在相同時間的記錄
    const existingIndex = this.records.findIndex(r => 
      r.date === record.date && r.time === record.time
    );
    
    if (existingIndex >= 0) {
      // 更新現有記錄
      this.records[existingIndex] = record;
    } else {
      // 新增記錄
      this.records.push(record);
    }
    
    // 只保留今天和昨天的記錄
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const cutoffDate = twoDaysAgo.toISOString().split('T')[0];
    
    this.records = this.records.filter(r => r.date >= cutoffDate);
  }

  // 獲取指定日期的記錄
  getRecordsByDate(date: string): WaterQualityRecord[] {
    return this.records
      .filter(r => r.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  // 獲取今日記錄
  getTodayRecords(): WaterQualityRecord[] {
    const today = new Date().toISOString().split('T')[0];
    return this.getRecordsByDate(today);
  }

  // 清除所有記錄
  clear(): void {
    this.records = [];
  }

  // 獲取記錄總數
  getRecordCount(): number {
    return this.records.length;
  }
}

export const waterQualityMemoryStore = new WaterQualityMemoryStore();