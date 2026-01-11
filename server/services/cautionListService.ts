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
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = 'https://ap7.ragic.com/xinsheng/ragicforms4/21/3';
  }

  private getApiKey(): string {
    return process.env.RAGIC_CAUTION_API_KEY || '';
  }

  async queryByIdCard(idCard: string): Promise<CautionListResult> {
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      console.error('❌ RAGIC_CAUTION_API_KEY 缺失（每次查詢時動態檢查）');
      return { found: false, records: [], error: 'RAGIC 慎用名單 API Key 未設定' };
    }

    console.log(`✅ RAGIC_CAUTION_API_KEY 已載入 (長度: ${apiKey.length})`);

    try {
      const url = `${this.baseUrl}?api&where=身分證字號,eq,${encodeURIComponent(idCard)}`;
      
      console.log(`🔍 查詢慎用名單: ${this.maskIdCard(idCard)}`);
      console.log(`📡 API URL: ${this.baseUrl}?api&where=身分證字號,eq,${this.maskIdCard(idCard)}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${apiKey}`,
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
      const normalizedQueryId = idCard.toUpperCase().trim();
      
      for (const [recordId, record] of Object.entries(data)) {
        if (recordId === 'status' || !record || typeof record !== 'object') continue;
        
        const r = record as Record<string, any>;
        
        const recordIdCard = (r['身分證字號'] || '').toUpperCase().trim();
        if (recordIdCard !== normalizedQueryId) {
          console.log(`⚠️ 身分證不符，跳過記錄: 查詢=${normalizedQueryId}, 記錄=${recordIdCard}`);
          continue;
        }
        
        const location = Array.isArray(r['應聘館別']) ? r['應聘館別'].join('、') : (r['應聘館別'] || '');
        const position = Array.isArray(r['應聘職位']) ? r['應聘職位'].join('、') : (r['應聘職位'] || '');
        
        let reason = r['具體事由'] || '';
        let internalHandling = '';
        let reporterEmployeeId = '';
        let incidentDate = '';
        
        const subtable = r['_subtable_1005619'];
        if (subtable && typeof subtable === 'object') {
          const firstEntry = Object.values(subtable)[0] as Record<string, any> | undefined;
          if (firstEntry) {
            reason = firstEntry['具體事由'] || firstEntry['具體事由（串）'] || reason;
            internalHandling = firstEntry['內部處理方式'] || '';
            reporterEmployeeId = firstEntry['通報人員編'] || '';
            incidentDate = firstEntry['發生時日（估）'] || '';
          }
        }
        
        records.push({
          id: recordId,
          name: r['姓名'] || '',
          employeeId: r['員工編號'] || '',
          idCard: recordIdCard,
          phone: r['電話'] || '',
          location,
          gender: r['性別'] || '',
          birthDate: r['出生年月日'] || '',
          position,
          address: r['聯絡地址'] || '',
          reporterEmployeeId,
          incidentDate,
          reason,
          internalHandling
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
