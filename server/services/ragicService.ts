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

// 完整的員工資料介面（包含在職狀態）
interface EmployeeDetails {
  employeeId: string;
  employeeName?: string;
  department?: string;
  employmentStatus?: string; // 在職狀態
  isActive: boolean; // 是否在職
}

// RAGIC API 回應格式
interface RagicApiResponse {
  success: boolean;
  data: any[];
  error?: string;
  fieldMapping?: {
    lineIdField: string;
    employeeIdField: string;
  };
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
    
    // 從環境變數取得認證資訊
    const ragicUsername = process.env.RAGIC_USERNAME?.trim();
    const ragicApiKey = process.env.RAGIC_API_KEY;
    
    if (!ragicApiKey) {
      throw new Error('RAGIC_API_KEY environment variable is required');
    }
    
    if (!ragicUsername) {
      throw new Error('RAGIC_USERNAME environment variable is required - 需要實際的 RAGIC 使用者登入名稱（非帳戶名稱）');
    }
    
    this.apiKey = ragicApiKey.trim();
    
    // 根據 RAGIC 官方文件：使用 username:apikey 的 Base64 編碼
    const credentials = `${ragicUsername}:${this.apiKey}`;
    this.basicAuth = Buffer.from(credentials).toString('base64');
    
    // 使用正確的 RAGIC API 端點格式（移除 /api/ 使用直接路徑）
    // https://ap7.ragic.com/xinsheng/ragicforms4/20004?v=3
    this.baseUrl = `https://${this.domain}/xinsheng/ragicforms4/20004`;
    
    console.log('🔧 RAGIC 服務初始化:', {
      domain: this.domain,
      databasePath: this.databasePath,
      hasUsername: !!ragicUsername,
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl,
      authFormatCorrect: this.basicAuth.length > 0
    });
  }

  /**
   * 根據 LINE ID 查詢完整員工資料（包含在職狀態驗證）
   */
  async getEmployeeDetailsByLineId(lineId: string): Promise<EmployeeDetails | null> {
    try {
      // 檢查 API 設定
      if (!this.domain || !this.apiKey || !this.databasePath) {
        console.warn('⚠️ RAGIC API 設定不完整，返回模擬資料');
        return {
          employeeId: 'DEMO_001',
          employeeName: '模擬員工',
          department: '資訊部',
          employmentStatus: '在職',
          isActive: true
        };
      }

      // 正規化 LINE ID
      const normalizedLineId = lineId.trim();
      console.log('🔍 正在查詢員工完整資料，LINE ID:', normalizedLineId);
      
      // 查詢 RAGIC API
      const response = await this.queryEmployeeData(normalizedLineId);
      
      if (response.success && response.data.length > 0) {
        const employee = response.data[0];
        
        // 使用動態欄位對應或預設欄位
        const fieldMapping = (response as any).fieldMapping || {
          lineIdField: '1003633',
          employeeIdField: '員工編號'
        };
        
        const employeeId = employee[fieldMapping.employeeIdField];
        const employeeName = employee['姓名'] || employee['名稱'];
        const department = Array.isArray(employee['部門']) ? employee['部門'].join(',') : employee['部門'];
        const employmentStatus = employee['在職狀態'] || employee['status']; // 嘗試多種可能的欄位名稱
        
        console.log('👤 RAGIC 員工完整資料查詢結果:', { 
          employeeId, 
          employeeName,
          department,
          employmentStatus,
          hasEmployee: !!employee,
          fieldKeys: Object.keys(employee || {}),
          lineId: normalizedLineId
        });
        
        if (employeeId) {
          // 判斷是否在職 (檢查在職狀態是否為"在職")
          const isActive = employmentStatus === '在職';
          
          const employeeDetails: EmployeeDetails = {
            employeeId: employeeId.toString(),
            employeeName,
            department,
            employmentStatus,
            isActive
          };
          
          // 記錄查詢結果
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'info',
            category: 'ragic',
            message: 'RAGIC 員工完整資料查詢成功',
            details: {
              lineId: normalizedLineId,
              employeeId,
              employmentStatus,
              isActive,
              source: 'RAGIC_API'
            }
          });
          
          return employeeDetails;
        }
      }

      // 查不到資料
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'warning',
        category: 'ragic',
        message: 'RAGIC 查無員工完整資料',
        details: {
          lineId: lineId,
          apiResponse: response
        }
      });

      return null;

    } catch (error) {
      console.error('❌ RAGIC API 查詢員工完整資料失敗:', error);
      
      // 記錄錯誤
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'ragic',
        message: 'RAGIC API 查詢員工完整資料失敗',
        details: {
          lineId: lineId,
          error: (error as Error).message
        }
      });

      return null;
    }
  }

  /**
   * 根據 LINE ID 查詢員工編號（含快取機制）
   */
  async getEmployeeByLineId(lineId: string): Promise<string | null> {
    try {
      // 檢查 API 設定
      if (!this.domain || !this.apiKey || !this.databasePath) {
        console.warn('⚠️ RAGIC API 設定不完整，使用模擬資料');
        return this.getMockEmployeeId(lineId);
      }

      // 正規化 LINE ID
      const normalizedLineId = lineId.trim();
      console.log('🔍 正在查詢員工編號，LINE ID:', normalizedLineId);
      
      // 1. 首先檢查快取
      console.log('💾 檢查員工資料快取...');
      const cachedData = await storage.getEmployeeCache(normalizedLineId);
      
      if (cachedData) {
        console.log(`⚡ 快取命中！員工編號: ${cachedData.employeeId}，節省查詢時間`);
        
        // 更新存取記錄
        await storage.updateEmployeeCacheAccess(normalizedLineId);
        
        // 記錄快取命中
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'ragic_cache',
          message: 'RAGIC 員工快取命中',
          details: {
            lineId: normalizedLineId,
            employeeId: cachedData.employeeId,
            source: 'CACHE',
            accessCount: cachedData.accessCount
          }
        });
        
        return cachedData.employeeId;
      }
      
      // 2. 快取未命中，進行 RAGIC API 查詢
      console.log('💾 快取未命中，查詢 RAGIC API...');
      const response = await this.queryEmployeeData(normalizedLineId);
      
      if (response.success && response.data.length > 0) {
        const employee = response.data[0];
        
        // 使用動態欄位對應或預設欄位
        const fieldMapping = (response as any).fieldMapping || {
          lineIdField: '1003633',
          employeeIdField: '員工編號'
        };
        
        const employeeId = employee[fieldMapping.employeeIdField];
        
        console.log('👤 RAGIC 員工資料查詢結果:', { 
          employeeId, 
          hasEmployee: !!employee,
          fieldKeys: Object.keys(employee || {}),
          lineId: normalizedLineId,
          fieldMapping: fieldMapping,
          使用欄位: fieldMapping.employeeIdField
        });
        
        if (employeeId) {
          // 3. 儲存到快取（24小時有效期）
          try {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小時後過期
            await storage.insertEmployeeCache({
              id: crypto.randomUUID(),
              lineId: normalizedLineId,
              employeeId: employeeId.toString(),
              employeeName: employee['姓名'] || employee['名稱'],
              department: Array.isArray(employee['部門']) ? employee['部門'].join(',') : employee['部門'],
              expiresAt
            });
            console.log('💾 員工資料已快取，24小時有效期');
          } catch (cacheError) {
            console.error('⚠️ 快取儲存失敗（但不影響查詢結果）:', cacheError);
          }
          
          // 記錄成功查詢
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'info',
            category: 'ragic',
            message: 'RAGIC 員工查詢成功',
            details: {
              lineId: normalizedLineId,
              employeeId,
              source: 'RAGIC_API',
              fieldMapping: fieldMapping,
              cached: true
            }
          });
          
          return employeeId.toString();
        } else {
          // 如果指定欄位沒有值，嘗試搜尋所有可能的員工編號欄位
          console.log('⚠️ 指定欄位無值，搜尋所有可能的員工編號欄位');
          
          const numericFields = Object.keys(employee).filter(k => /^\d+$/.test(k));
          for (const fieldId of numericFields) {
            const value = employee[fieldId];
            if (typeof value === 'string' && /^\d{4,}$/.test(value)) {
              console.log(`💡 找到可能的員工編號 ${fieldId}: ${value}`);
              
              // 記錄發現的欄位
              await storage.insertAuditLog({
                id: crypto.randomUUID(),
                level: 'info',
                category: 'ragic',
                message: '發現替代員工編號欄位',
                details: {
                  lineId: normalizedLineId,
                  employeeId: value,
                  fieldId: fieldId,
                  source: 'RAGIC_API_DISCOVERY'
                }
              });
              
              return value.toString();
            }
          }
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
      // 使用正確的 Basic Auth + ?api 標記方式
      const queryUrl = `${this.baseUrl}?v=3&api&where=1003633,eq,${encodeURIComponent(lineId)}`;
      
      console.log('🔍 直接查詢員工資料，URL:', queryUrl);
      
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.basicAuth}`,
          'Accept': 'application/json'
        }
      });
      
      console.log('📡 RAGIC API 回應狀態:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        
        console.log('📋 RAGIC API 回應資料類型:', typeof data);
        console.log('📋 RAGIC API 回應結構:', {
          isArray: Array.isArray(data),
          keys: Object.keys(data || {}),
          dataLength: Array.isArray(data) ? data.length : 'not array'
        });
        
        if (data && data.status === 'ERROR') {
          console.error('❌ RAGIC API 錯誤:', data.msg);
          return { success: false, data: [], error: data.msg };
        }
        
        // 正規化數據：RAGIC 回傳格式為 {"記錄ID": {實際資料}}
        let normalizedData = [];
        
        if (Array.isArray(data)) {
          normalizedData = data;
        } else if (data && typeof data === 'object') {
          // 提取 RAGIC 回應中的實際員工資料（跳過記錄 ID 層級）
          const recordKeys = Object.keys(data).filter(key => !key.startsWith('_'));
          normalizedData = recordKeys.map(recordId => data[recordId]);
        }
        
        console.log('📋 正規化後的資料筆數:', normalizedData.length);
        
        // 檢查第一筆資料的欄位
        if (normalizedData.length > 0) {
          console.log('📋 第一筆資料欄位:', Object.keys(normalizedData[0] || {}));
        }
        
        return {
          success: true,
          data: normalizedData,
          fieldMapping: { lineIdField: '1003633', employeeIdField: '員工編號' }
        };
      } else {
        console.error('❌ RAGIC API 請求失敗，狀態碼:', response.status);
        return { success: false, data: [], error: `HTTP ${response.status}` };
      }
      
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
   * 尋找包含員工資料的 RAGIC 表單
   */
  private async findEmployeeForm(lineId: string): Promise<{
    url: string;
    fieldMapping: {
      lineIdField: string;
      employeeIdField: string;
    };
  } | null> {
    console.log('🔍 搜尋員工資料表單...');
    
    // 可能包含員工資料的表單候選清單
    const candidateUrls = [
      // 嘗試不同的表單 ID 和路徑組合
      `${this.baseUrl}/ragicforms4/20004?api&v=3&limit=5`,
      `${this.baseUrl}?PAGEID=20004&api&v=3&limit=5`,
      `${this.baseUrl}/ragicforms1/1?api&v=3&limit=5`,
      `${this.baseUrl}/ragicforms1/2?api&v=3&limit=5`,
      `${this.baseUrl}/ragicforms1/3?api&v=3&limit=5`,
      `${this.baseUrl}?PAGEID=1&api&v=3&limit=5`,
      `${this.baseUrl}?PAGEID=2&api&v=3&limit=5`,
      `${this.baseUrl}?PAGEID=3&api&v=3&limit=5`,
      `${this.baseUrl}?PAGEID=4&api&v=3&limit=5`,
      `${this.baseUrl}?PAGEID=5&api&v=3&limit=5`
    ];
    
    for (const testUrl of candidateUrls) {
      try {
        console.log(`🧪 測試表單: ${testUrl}`);
        
        const response = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // 檢查是否為錯誤回應
          if (data && data.status === 'ERROR') {
            if (!data.msg.includes('guest account')) {
              console.log(`❌ 表單錯誤: ${data.msg}`);
            }
            continue;
          }
          
          // 檢查是否為有效的資料記錄
          if (Array.isArray(data) && data.length > 0) {
            const firstRecord = data[0];
            const fieldIds = Object.keys(firstRecord);
            const numericFields = fieldIds.filter(k => /^\d+$/.test(k));
            
            console.log(`📊 找到 ${data.length} 筆記錄，${numericFields.length} 個數字欄位`);
            
            if (numericFields.length > 5) { // 可能是 RAGIC 表單
              // 檢查是否包含預期的欄位
              let lineIdField = '1003633';
              let employeeIdField = '員工編號';
              
              if (numericFields.includes('1003633') && data.hasOwnProperty('員工編號')) {
                console.log('✅ 找到預期的欄位配置');
              } else {
                // 嘗試尋找可能的 LINE ID 和員工編號欄位
                const possibleLineIdFields = await this.findFieldsByContent(data, lineId, /^U[a-f0-9]{32}$/);
                const possibleEmployeeIdFields = await this.findFieldsByContent(data, null, /^\d{4,}$/);
                
                if (possibleLineIdFields.length > 0) {
                  lineIdField = possibleLineIdFields[0];
                  console.log(`💡 發現可能的 LINE ID 欄位: ${lineIdField}`);
                }
                
                if (possibleEmployeeIdFields.length > 0) {
                  employeeIdField = possibleEmployeeIdFields[0];
                  console.log(`💡 發現可能的員工編號欄位: ${employeeIdField}`);
                }
              }
              
              return {
                url: testUrl,
                fieldMapping: {
                  lineIdField,
                  employeeIdField
                }
              };
            }
          }
        }
        
        // 延遲避免 API 限制
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.log(`❌ 測試表單失敗: ${testUrl}`);
      }
    }
    
    return null;
  }

  /**
   * 根據內容尋找可能的欄位
   */
  private async findFieldsByContent(data: any[], searchValue: string | null, pattern: RegExp): Promise<string[]> {
    const candidateFields: string[] = [];
    
    for (const record of data.slice(0, 10)) { // 只檢查前10筆記錄
      const numericFields = Object.keys(record).filter(k => /^\d+$/.test(k));
      
      for (const fieldId of numericFields) {
        const value = record[fieldId];
        if (typeof value === 'string') {
          if (searchValue && value.includes(searchValue)) {
            candidateFields.push(fieldId);
          } else if (!searchValue && pattern.test(value)) {
            candidateFields.push(fieldId);
          }
        }
      }
    }
    
    return Array.from(new Set(candidateFields)); // 去重
  }

  /**
   * 原始查詢方法（向後相容）
   */
  private async legacyQueryMethod(lineId: string): Promise<RagicApiResponse> {
    const queryUrl = `${this.baseUrl}?v=3&api&where=1003633,eq,${encodeURIComponent(lineId)}`;
    
    console.log('🔍 使用原始查詢方法:', queryUrl);
    
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${this.basicAuth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RAGIC API 回應錯誤: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data && typeof data === 'object' && data.status === 'ERROR') {
      return { success: false, data: [], error: data.msg };
    }
    
    let normalizedData = [];
    if (Array.isArray(data)) {
      normalizedData = data;
    } else if (data && typeof data === 'object') {
      normalizedData = Object.values(data);
    }
    
    return { success: true, data: normalizedData };
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