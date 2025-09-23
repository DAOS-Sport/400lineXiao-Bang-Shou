/**
 * RAGIC API 服務 - 員工資料查詢（使用新的 SDK）
 * 整合 RAGIC 系統取得員工編號
 */

import crypto from 'crypto';
import { storage } from '../storage';
import { RagicService as SDKRagicService, FIELD_MAPPING, StandardRecord } from './ragic-sdk';

// RAGIC 員工資料介面（保持不變）
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

// RAGIC API 回應格式（保持不變）
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
  private sdkService: SDKRagicService;

  constructor() {
    try {
      this.sdkService = new SDKRagicService();
      
      console.log('🔧 RAGIC 服務初始化 (新 SDK 模式):', {
        domain: 'ap7.ragic.com',
        databasePath: 'xinsheng',
        formId: 'ragicforms4',
        sheetId: '20004',
        hasApiKey: !!process.env.RAGIC_API_KEY,
        apiConfigured: true,
        fieldMappings: FIELD_MAPPING
      });
    } catch (error) {
      console.error('❌ RAGIC SDK 初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 根據員工編號查詢完整員工資料
   */
  async getEmployeeDetailsByEmployeeId(employeeId: string): Promise<EmployeeDetails | null> {
    try {
      console.log('🔍 正在查詢員工資料，員工編號:', employeeId);
      
      // 使用新 SDK 查詢
      const records = await this.sdkService.searchStd('employeeNo', 'eq', employeeId);
      
      if (records.length > 0) {
        const employee = records[0];
        
        const employeeName = employee['姓名'] || employee['名稱'];
        const department = Array.isArray(employee['部門']) ? employee['部門'].join(',') : employee['部門'];
        const employmentStatus = employee['employmentStatus'] || employee['在職狀態'];
        
        console.log('👤 RAGIC 員工資料查詢結果（通過員工編號）:', { 
          employeeId, 
          employeeName,
          department,
          employmentStatus
        });
        
        const isActive = employmentStatus === '在職';
        
        const employeeDetails: EmployeeDetails = {
          employeeId: employeeId,
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
          message: 'RAGIC 員工資料查詢成功（通過員工編號）',
          details: {
            employeeId,
            employmentStatus,
            isActive,
            source: 'RAGIC_SDK_BY_EMPLOYEE_ID'
          }
        });
        
        return employeeDetails;
      }

      // 查不到資料
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'warning',
        category: 'ragic',
        message: 'RAGIC 查無員工資料（通過員工編號）',
        details: {
          employeeId: employeeId
        }
      });

      return null;

    } catch (error) {
      console.error('❌ RAGIC API 查詢員工資料失敗（通過員工編號）:', error);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'ragic',
        message: 'RAGIC API 查詢員工資料失敗（通過員工編號）',
        details: {
          employeeId: employeeId,
          error: (error as Error).message
        }
      });

      return null;
    }
  }

  /**
   * 根據個人LINE ID查詢完整員工資料
   */
  async getEmployeeDetailsByLineId(lineId: string): Promise<EmployeeDetails | null> {
    try {
      // 正規化個人LINE ID
      const normalizedLineId = lineId.trim();
      console.log('🔍 正在查詢員工完整資料，個人LINE ID:', normalizedLineId);
      
      // 使用新 SDK 查詢
      const records = await this.sdkService.searchStd('lineId', 'eq', normalizedLineId);
      
      if (records.length > 0) {
        const employee = records[0];
        
        const employeeId = employee['employeeNo'] || employee['員工編號'];
        const employeeName = employee['姓名'] || employee['名稱'];
        const department = Array.isArray(employee['部門']) ? employee['部門'].join(',') : employee['部門'];
        const employmentStatus = employee['employmentStatus'] || employee['在職狀態'];
        
        console.log('👤 RAGIC 員工完整資料查詢結果:', { 
          employeeId, 
          employeeName,
          department,
          employmentStatus,
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
              source: 'RAGIC_SDK'
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
        message: 'RAGIC 查無員工資料（通過LINE ID）',
        details: {
          lineId: normalizedLineId
        }
      });

      return null;

    } catch (error) {
      console.error('❌ RAGIC API 查詢員工資料失敗（通過LINE ID）:', error);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'ragic',
        message: 'RAGIC API 查詢員工資料失敗（通過LINE ID）',
        details: {
          lineId: lineId,
          error: (error as Error).message
        }
      });

      return null;
    }
  }

  /**
   * 傳統介面兼容：根據個人LINE ID查詢員工編號
   */
  async getEmployeeByLineId(lineId: string): Promise<RagicEmployee | null> {
    const employeeDetails = await this.getEmployeeDetailsByLineId(lineId);
    
    if (employeeDetails) {
      return {
        lineId: lineId,
        employeeId: employeeDetails.employeeId,
        name: employeeDetails.employeeName,
        department: employeeDetails.department
      };
    }
    
    return null;
  }

  /**
   * 測試 RAGIC API 連線
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 測試 RAGIC SDK 連線...');
      
      // 嘗試查詢前幾筆資料來測試連線
      const records = await this.sdkService.getAll({ limit: 1 });
      
      const success = Array.isArray(records);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: success ? 'info' : 'error',
        category: 'ragic',
        message: `RAGIC SDK 連線測試${success ? '成功' : '失敗'}`,
        details: {
          recordCount: records?.length || 0,
          testMethod: 'SDK_getAll'
        }
      });

      return success;

    } catch (error) {
      console.error('❌ RAGIC SDK 連線測試失敗:', error);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'ragic',
        message: 'RAGIC SDK 連線測試失敗',
        details: {
          error: (error as Error).message
        }
      });
      
      return false;
    }
  }
}

// 匯出實例
export const ragicService = new RagicService();