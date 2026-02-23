import { db } from '../db';
import { interviewAuthorizedUsers } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { lifeguardLicenseService } from './lifeguardLicenseService';
import { cautionListService } from './cautionListService';
import { storage } from '../storage';

interface InterviewCheckResult {
  authorized: boolean;
  userName?: string;
  licenseResult?: string;
  cautionResult?: string;
  combinedResult?: string;
}

export class InterviewCheckService {

  async isAuthorizedForInterview(userId: string): Promise<{ authorized: boolean; userName?: string }> {
    try {
      console.log(`🔐 檢查面試授權，userId: ${userId}`);
      
      // 只按 userId 查詢，避免類型比較問題
      const [user] = await db.select()
        .from(interviewAuthorizedUsers)
        .where(eq(interviewAuthorizedUsers.userId, userId));

      console.log(`🔐 查詢結果:`, user ? JSON.stringify({
        userName: user.userName,
        isActive: user.isActive,
        isActiveType: typeof user.isActive,
        canInterviewCheck: user.canInterviewCheck,
        canInterviewCheckType: typeof user.canInterviewCheck
      }) : '未找到用戶');

      if (!user) {
        console.log(`❌ 用戶 ${userId} 不在授權名單中`);
        return { authorized: false };
      }

      // 在 TypeScript 中檢查權限（支援布林值和字符串，生產環境可能返回布林值）
      const isActiveVal = user.isActive as unknown;
      const canCheckVal = user.canInterviewCheck as unknown;
      const isActive = isActiveVal === true || isActiveVal === 'true' || isActiveVal === 't';
      const canCheck = canCheckVal === true || canCheckVal === 'true' || canCheckVal === 't';

      console.log(`🔐 權限檢查: isActive=${isActive}, canInterviewCheck=${canCheck}`);

      if (isActive && canCheck) {
        return { authorized: true, userName: user.userName };
      }
      
      console.log(`❌ 用戶 ${user.userName} 權限不足 (isActive=${user.isActive}, canInterviewCheck=${user.canInterviewCheck})`);
      return { authorized: false };
    } catch (error) {
      console.error('檢查面試模組授權失敗:', error);
      return { authorized: false };
    }
  }

  async isAuthorizedForInternalQuery(userId: string): Promise<{ authorized: boolean; userName?: string }> {
    try {
      // 只按 userId 查詢，避免類型比較問題
      const [user] = await db.select()
        .from(interviewAuthorizedUsers)
        .where(eq(interviewAuthorizedUsers.userId, userId));

      if (!user) {
        return { authorized: false };
      }

      // 在 TypeScript 中檢查權限（支援布林值和字符串，生產環境可能返回布林值）
      const isActiveVal = user.isActive as unknown;
      const canQueryVal = user.canInternalQuery as unknown;
      const isActive = isActiveVal === true || isActiveVal === 'true' || isActiveVal === 't';
      const canQuery = canQueryVal === true || canQueryVal === 'true' || canQueryVal === 't';

      if (isActive && canQuery) {
        return { authorized: true, userName: user.userName };
      }
      return { authorized: false };
    } catch (error) {
      console.error('檢查內部查詢模組授權失敗:', error);
      return { authorized: false };
    }
  }

  async performInterviewCheck(userId: string, idCard: string): Promise<InterviewCheckResult> {
    const authResult = await this.isAuthorizedForInterview(userId);
    
    if (!authResult.authorized) {
      return {
        authorized: false,
        combinedResult: '❌ 您無權使用面試檢核功能\n請聯繫管理員取得授權'
      };
    }

    console.log(`🔍 ${authResult.userName} 正在執行面試檢核，身分證: ${this.maskIdCard(idCard)}`);

    console.log(`⏱️ 開始並行查詢：救生員證照 + 慎用名單...`);
    const [licenseResult, cautionResult] = await Promise.all([
      lifeguardLicenseService.queryLicense(idCard).catch(err => {
        console.error(`❌ 救生員證照查詢異常:`, err.message || err);
        return { success: false, error: `查詢異常: ${err.message || '未知錯誤'}` } as any;
      }),
      cautionListService.queryByIdCard(idCard).catch(err => {
        console.error(`❌ 慎用名單查詢異常:`, err.message || err);
        return { found: false, records: [] } as any;
      }),
    ]);
    console.log(`⏱️ 並行查詢完成：證照=${licenseResult.success ? '成功' : licenseResult.error}, 慎用=${cautionResult.found ? '有記錄' : '無記錄'}`);

    // 先顯示快速檢核結果
    let combinedResult = `📋 面試檢核報告\n`;
    combinedResult += `查詢人：${authResult.userName}\n\n`;
    
    combinedResult += `【查詢檢核】\n`;
    combinedResult += cautionResult.found 
      ? `🚨 注意！此人在慎用名單中\n` 
      : `✅ 此人不在慎用名單中\n`;
    const hasLicense = licenseResult.success && licenseResult.data && licenseResult.data.length > 0;
    const licenseApiError = !licenseResult.success;
    if (licenseApiError) {
      combinedResult += `⚠️ 無法取得證照資訊\n`;
    } else {
      combinedResult += hasLicense 
        ? `✅ 已取得救生員證照\n` 
        : `⚠️ 未取得救生員證照\n`;
    }

    // 慎用名單詳細資料（不管是否找到都顯示）
    combinedResult += `\n【慎用名單查詢】\n`;
    if (cautionResult.found && cautionResult.records.length > 0) {
      const record = cautionResult.records[0];
      combinedResult += `\n【慎用資料】\n`;
      if (record.name) combinedResult += `姓名：${record.name}\n`;
      if (record.employeeId) combinedResult += `員工編號：${record.employeeId}\n`;
      if (record.phone) combinedResult += `電話：${record.phone}\n`;
      if (record.birthDate) combinedResult += `出生年月日：${record.birthDate}\n`;
      if (record.position) combinedResult += `應聘職位：${record.position}\n`;
      
      combinedResult += `\n【慎用緣由】\n`;
      if (record.incidentDate) combinedResult += `發生時日（估）：${record.incidentDate}\n`;
      if (record.reason) combinedResult += `具體事由：${record.reason}\n`;
      if (record.internalHandling) combinedResult += `內部處理方式：${record.internalHandling}\n`;
    } else {
      combinedResult += `身分證：${this.maskIdCard(idCard)}\n`;
      combinedResult += `查詢結果：此人不在慎用名單中\n`;
    }

    // 救生員證照詳細資料
    combinedResult += `\n【救生員證照查詢】\n`;
    combinedResult += `ℹ️ 救生員證照查詢結果\n`;
    combinedResult += `身分證：${this.maskIdCard(idCard)}\n`;
    if (licenseApiError) {
      combinedResult += `無法取得證照資訊（${licenseResult.error || '查詢失敗'}）`;
    } else {
      combinedResult += hasLicense 
        ? `此人已考取救生員證照` 
        : `此人未考取救生員證照`;
    }

    const licenseText = lifeguardLicenseService.formatLicenseResult(licenseResult, idCard);
    const cautionText = cautionListService.formatCautionResult(cautionResult, idCard);

    await this.logInterviewCheck(userId, authResult.userName || '', idCard, combinedResult);

    return {
      authorized: true,
      userName: authResult.userName,
      licenseResult: licenseText,
      cautionResult: cautionText,
      combinedResult
    };
  }

  private async checkCautionList(idCard: string): Promise<string> {
    try {
      const result = await cautionListService.queryByIdCard(idCard);
      return cautionListService.formatCautionResult(result, idCard);
    } catch (error) {
      console.error('慎用名單查詢錯誤:', error);
      return `⚠️ 慎用名單查詢失敗，請稍後再試`;
    }
  }

  private maskIdCard(idCard: string): string {
    if (idCard.length < 4) return idCard;
    return idCard.substring(0, 1) + '***' + idCard.substring(idCard.length - 4);
  }

  private async logInterviewCheck(userId: string, userName: string, idCard: string, result: string): Promise<void> {
    try {
      await storage.insertAuditLog({
        id: `audit-${Date.now()}`,
        level: 'info',
        category: 'interview_check',
        message: `面試檢核：${userName} 查詢 ${this.maskIdCard(idCard)}`,
        details: {
          userId,
          userName,
          idCardMasked: this.maskIdCard(idCard),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('記錄面試檢核日誌失敗:', error);
    }
  }
}

export const interviewCheckService = new InterviewCheckService();
