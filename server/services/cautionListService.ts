interface CautionRecord {
  id: string;
  name: string;
  employeeId: string;
  idCard: string;
  phone: string;
  location: string;
  gender: string;
  birthDate: string;
  position: string;
  address: string;
  reporterEmployeeId: string;
  incidentDate: string;
  reason: string;
  internalHandling: string;
}

interface CautionListResult {
  found: boolean;
  records: CautionRecord[];
  error?: string;
}

export class CautionListService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.RAGIC_CAUTION_API_KEY || '';
    this.baseUrl = 'https://ap7.ragic.com/xinsheng/ragicforms4/21/3';
  }

  async queryByIdCard(idCard: string): Promise<CautionListResult> {
    if (!this.apiKey) {
      console.error('RAGIC_CAUTION_API_KEY 缺失');
      return { found: false, records: [], error: 'RAGIC 慎用名單 API Key 未設定' };
    }

    try {
      const url = `${this.baseUrl}?api&where=1003930,eq,${encodeURIComponent(idCard)}`;
      
      console.log(`🔍 查詢慎用名單: ${this.maskIdCard(idCard)}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(this.apiKey).toString('base64')}`,
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
          employeeId: r['1005613'] || '',
          idCard: r['1003930'] || '',
          phone: r['1003929'] || '',
          location: r['1003932'] || '',
          gender: r['1003931'] || '',
          birthDate: r['1005621'] || '',
          position: r['1003933'] || '',
          address: r['1003935'] || '',
          reporterEmployeeId: r['1005614'] || '',
          incidentDate: r['1005626'] || '',
          reason: r['1005627'] || r['1005628'] || r['1005615'] || '',
          internalHandling: r['1005616'] || ''
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

    let response = `🚨 注意！此人在慎用名單中\n`;
    response += `━━━━━━━━━━━━━━━━\n`;

    result.records.forEach((record, index) => {
      response += `\n【慎用資料】\n`;
      if (record.name) response += `姓名：${record.name}\n`;
      if (record.employeeId) response += `員工編號：${record.employeeId}\n`;
      response += `身分證字號：${this.maskIdCard(idCard)}\n`;
      if (record.phone) response += `電話：${record.phone}\n`;
      if (record.location) response += `應聘館別：${record.location}\n`;
      if (record.gender) response += `性別：${record.gender}\n`;
      if (record.birthDate) response += `出生年月日：${record.birthDate}\n`;
      if (record.position) response += `應聘職位：${record.position}\n`;
      if (record.address) response += `聯絡地址：${record.address}\n`;
      
      response += `\n【慎用緣由】\n`;
      if (record.reporterEmployeeId) response += `通報人員編：${record.reporterEmployeeId}\n`;
      if (record.incidentDate) response += `發生時日（估）：${record.incidentDate}\n`;
      if (record.reason) response += `具體事由：${record.reason}\n`;
      if (record.internalHandling) response += `內部處理方式：${record.internalHandling}\n`;
    });

    return response;
  }

  private maskIdCard(idCard: string): string {
    if (idCard.length < 4) return idCard;
    return idCard.substring(0, 1) + '***' + idCard.substring(idCard.length - 4);
  }
}

export const cautionListService = new CautionListService();
