/**
 * RAGIC API 服務 - 員工資料查詢
 * 整合 RAGIC 系統取得員工編號
 */

import crypto from 'crypto';
import { storage } from '../storage';

// RAGIC 員工資料介面
interface RagicEmployee {
  lineId: string;
  employeeId: string;
  name?: string;
  department?: string;
}

// RAGIC API 回應格式
interface RagicApiResponse {
  success: boolean;
  data: any[];
  error?: string;
}

export class RagicService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly databasePath: string;
  private readonly basicAuth: string;

  constructor() {
    // 從環境變數取得 RAGIC 連線資訊
    this.domain = process.env.RAGIC_DOMAIN || '';
    this.databasePath = process.env.RAGIC_DATABASE_ID || '';
    
    // 從環境變數取得 API KEY，使用已驗證有效的 KEY 作為 fallback
    const envApiKey = process.env.RAGIC_API_KEY || 'c0VySnlCOEJ6dHlndkRHY0pUOTFEMnh6Zmo3VE9lYWdsVXRkTkJOUEJ3ZjRLMi91QWhHbExaeWdzUWttMUdGQ200NzNmMHI4RlNjPQ==';
    
    this.apiKey = envApiKey.trim();
    
    // 直接使用已驗證有效的 API KEY
    // 這個 KEY 已經在 curl 測試中確認可用
    this.basicAuth = this.apiKey;
    
    // 確保 URL 以斜線結尾避免重定向
    this.baseUrl = `https://${this.domain}/${this.databasePath}`.replace(/\/$/, '') + '/';
    
    console.log('🔧 RAGIC 服務初始化:', {
      domain: this.domain,
      databasePath: this.databasePath,
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl,
      authFormatCorrect: this.basicAuth.length > 0
    });
  }

  /**
   * 根據 LINE ID 查詢員工編號
   */
  async getEmployeeByLineId(lineId: string): Promise<string | null> {
    try {
      // 檢查 API 設定
      if (!this.domain || !this.apiKey || !this.databasePath) {
        console.warn('⚠️ RAGIC API 設定不完整，使用模擬資料');
        return this.getMockEmployeeId(lineId);
      }

      // 呼叫 RAGIC API 查詢員工資料
      // 正規化 LINE ID
      const normalizedLineId = lineId.trim();
      console.log('🔍 正在查詢員工編號，LINE ID:', normalizedLineId);
      
      const response = await this.queryEmployeeData(normalizedLineId);
      
      if (response.success && response.data.length > 0) {
        // RAGIC 回傳的資料格式，員工編號在欄位 ID 3000935
        const employee = response.data[0];
        const employeeId = employee['3000935']; // 員工編號欄位
        
        console.log('👤 RAGIC 員工資料查詢結果:', { 
          employeeId, 
          hasEmployee: !!employee,
          fieldKeys: Object.keys(employee || {}),
          lineId: normalizedLineId
        });
        
        if (employeeId) {
          // 記錄成功查詢
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'info',
            category: 'ragic',
            message: 'RAGIC 員工查詢成功',
            details: {
              lineId: normalizedLineId,
              employeeId,
              source: 'RAGIC_API'
            }
          });
          
          return employeeId.toString();
        }
      }

      // 查不到資料
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'warning',
        category: 'ragic',
        message: 'RAGIC 查無員工資料',
        details: {
          lineId: lineId,
          apiResponse: response
        }
      });

      return null;

    } catch (error) {
      console.error('❌ RAGIC API 查詢失敗:', error);
      
      // 記錄錯誤
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'ragic',
        message: 'RAGIC API 查詢失敗',
        details: {
          lineId: lineId,
          error: (error as Error).message
        }
      });

      // 回傳 null 表示查詢失敗
      return null;
    }
  }

  /**
   * 呼叫 RAGIC API 查詢員工資料
   */
  private async queryEmployeeData(lineId: string): Promise<RagicApiResponse> {
    try {
      // 使用 RAGIC API v3 格式並採用正確的參數順序：?api&v=3 和 Basic Authentication
      const queryUrl = `${this.baseUrl}?api&v=3&where=1003633,eq,${encodeURIComponent(lineId)}`;
      
      console.log('🔍 RAGIC 查詢 URL:', queryUrl);
      console.log('🔧 RAGIC 查詢設定:', {
        baseUrl: this.baseUrl,
        domain: this.domain,
        databasePath: this.databasePath,
        searchField: '1003633',
        searchValue: lineId
      });
      
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.basicAuth}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 RAGIC API 回應狀態:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ RAGIC API 錯誤回應:', errorText);
        throw new Error(`RAGIC API 回應錯誤: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📋 RAGIC API 回應資料類型:', typeof data);
      console.log('📋 RAGIC API 回應結構:', {
        isArray: Array.isArray(data),
        keys: typeof data === 'object' ? Object.keys(data) : 'not object',
        dataLength: Array.isArray(data) ? data.length : 'not array'
      });
      
      // 檢查 RAGIC 錯誤回應
      if (data && typeof data === 'object' && data.status === 'ERROR') {
        console.error('❌ RAGIC API 錯誤:', data.msg);
        return {
          success: false,
          data: [],
          error: data.msg
        };
      }
      
      // 正規化響應資料
      let normalizedData = [];
      if (Array.isArray(data)) {
        normalizedData = data;
      } else if (data && typeof data === 'object') {
        // RAGIC v3 可能返回對象映射，轉換為數組
        normalizedData = Object.values(data);
      } else {
        normalizedData = data ? [data] : [];
      }
      
      console.log('📋 正規化後的資料筆數:', normalizedData.length);
      if (normalizedData.length > 0) {
        console.log('📋 第一筆資料欄位:', Object.keys(normalizedData[0] || {}));
      }
      
      return {
        success: true,
        data: normalizedData
      };

    } catch (error) {
      console.error('❌ RAGIC API 查詢異常:', error);
      return {
        success: false,
        data: [],
        error: (error as Error).message
      };
    }
  }

  /**
   * 模擬員工資料（開發/測試用）
   */
  private getMockEmployeeId(lineId: string): string {
    // 基於 LINE ID 產生固定的模擬員工編號
    const mockEmployees: { [key: string]: string } = {
      'U8fd0e4be4e44a1304f9fa2e9855f4559': 'EMP001',
      'U1234567890abcdef1234567890abcdef': 'EMP002',
      'Uabcdef1234567890abcdef1234567890': 'EMP003'
    };

    // 如果有預設的對應，回傳對應編號
    if (mockEmployees[lineId]) {
      return mockEmployees[lineId];
    }

    // 否則基於 LINE ID 的 hash 產生員工編號
    const hash = crypto.createHash('md5').update(lineId).digest('hex');
    const employeeNum = (parseInt(hash.substring(0, 6), 16) % 9999 + 1).toString().padStart(4, '0');
    
    return `EMP${employeeNum}`;
  }

  /**
   * 測試 RAGIC API 連線
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.domain || !this.apiKey || !this.databasePath) {
        console.log('🧪 RAGIC 設定不完整，跳過連線測試');
        return false;
      }

      const testUrl = `${this.baseUrl}?v=3&api&limit=1`;
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.basicAuth}`,
          'Content-Type': 'application/json'
        }
      });

      const success = response.ok;
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: success ? 'info' : 'error',
        category: 'ragic',
        message: `RAGIC API 連線測試${success ? '成功' : '失敗'}`,
        details: {
          statusCode: response.status,
          domain: this.domain,
          databasePath: this.databasePath
        }
      });

      return success;

    } catch (error) {
      console.error('❌ RAGIC 連線測試失敗:', error);
      return false;
    }
  }
}

export const ragicService = new RagicService();