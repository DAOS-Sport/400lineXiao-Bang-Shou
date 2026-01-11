interface CautionRecord {
  id: string;
  name: string;
  idCard: string;
  reason: string;
  reportedBy: string;
  reportDate: string;
  position: string;
  location: string;
}

interface CautionListResult {
  found: boolean;
  records: CautionRecord[];
  error?: string;
}

export class CautionListService {
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly baseUrl: string;
  private readonly sheetIndex = '3';

  constructor() {
    this.apiKey = process.env.RAGIC_API_KEY || '';
    this.domain = process.env.RAGIC_DOMAIN || 'ap7.ragic.com';
    this.baseUrl = `https://${this.domain}/xinsheng/ragicforms4/21`;
  }

  async queryByIdCard(idCard: string): Promise<CautionListResult> {
    if (!this.apiKey) {
      console.error('RAGIC API Key 缺失');
      return { found: false, records: [], error: 'RAGIC 設定不完整' };
    }

    try {
      const url = `${this.baseUrl}/${this.sheetIndex}?api&where=1003930,eq,${encodeURIComponent(idCard)}`;
      
      console.log(`🔍 查詢慎用名單: ${this.maskIdCard(idCard)}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`RAGIC API 錯誤: ${response.status}`);
        return { found: false, records: [], error: `API 錯誤 (${response.status})` };
      }

      const data = await response.json();
      
      if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return { found: false, records: [] };
      }

      const records: CautionRecord[] = [];
      
      for (const [recordId, record] of Object.entries(data)) {
        if (recordId === 'status' || !record || typeof record !== 'object') continue;
        
        const r = record as Record<string, any>;
        records.push({
          id: recordId,
          name: r['1003928'] || '',
          idCard: r['1003930'] || '',
          reason: r['1005627'] || r['1005628'] || r['1005615'] || '',
          reportedBy: r['1003936'] || '',
          reportDate: r['105'] || '',
          position: r['1003933'] || '',
          location: r['1003932'] || ''
        });
      }

      console.log(`📋 慎用名單查詢結果: 找到 ${records.length} 筆記錄`);

      return {
        found: records.length > 0,
        records
      };

    } catch (error) {
      console.error('查詢慎用名單失敗:', error);
      return { found: false, records: [], error: '查詢過程發生錯誤' };
    }
  }

  formatCautionResult(result: CautionListResult, idCard: string): string {
    if (result.error) {
      return `⚠️ 慎用名單查詢失敗\n身分證：${this.maskIdCard(idCard)}\n原因：${result.error}`;
    }

    if (!result.found || result.records.length === 0) {
      return `✅ 此人不在慎用名單中`;
    }

    let response = `⚠️ 注意！此人在慎用名單中\n`;
    response += `身分證：${this.maskIdCard(idCard)}\n`;
    response += `━━━━━━━━━━━━━━━━\n`;

    result.records.forEach((record, index) => {
      response += `\n📌 記錄 #${index + 1}\n`;
      response += `姓名：${record.name}\n`;
      if (record.position) response += `應聘職位：${record.position}\n`;
      if (record.location) response += `應聘館別：${record.location}\n`;
      if (record.reason) response += `事由：${record.reason}\n`;
      if (record.reportedBy) response += `提報人：${record.reportedBy}\n`;
      if (record.reportDate) response += `提報日期：${record.reportDate}\n`;
    });

    return response;
  }

  private maskIdCard(idCard: string): string {
    if (idCard.length < 4) return idCard;
    return idCard.substring(0, 1) + '***' + idCard.substring(idCard.length - 4);
  }
}

export const cautionListService = new CautionListService();
