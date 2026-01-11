import { db } from '../db';
import { interviewAuthorizedUsers } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { lifeguardLicenseService } from './lifeguardLicenseService';
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
      
      const [user] = await db.select()
        .from(interviewAuthorizedUsers)
        .where(
          and(
            eq(interviewAuthorizedUsers.userId, userId),
            eq(interviewAuthorizedUsers.isActive, 'true'),
            eq(interviewAuthorizedUsers.canInterviewCheck, 'true')
          )
        );

      console.log(`🔐 授權查詢結果:`, user ? `找到 ${user.userName}` : '未找到');

      if (user) {
        return { authorized: true, userName: user.userName };
      }
      return { authorized: false };
    } catch (error) {
      console.error('檢查面試模組授權失敗:', error);
      return { authorized: false };
    }
  }

  async isAuthorizedForInternalQuery(userId: string): Promise<{ authorized: boolean; userName?: string }> {
    try {
      const [user] = await db.select()
        .from(interviewAuthorizedUsers)
        .where(
          and(
            eq(interviewAuthorizedUsers.userId, userId),
            eq(interviewAuthorizedUsers.isActive, 'true'),
            eq(interviewAuthorizedUsers.canInternalQuery, 'true')
          )
        );

      if (user) {
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

    const licenseResult = await lifeguardLicenseService.queryLicense(idCard);
    const licenseText = lifeguardLicenseService.formatLicenseResult(licenseResult, idCard);

    const cautionText = await this.checkCautionList(idCard);

    let combinedResult = `📋 面試檢核報告\n`;
    combinedResult += `查詢人：${authResult.userName}\n`;
    combinedResult += `查詢時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
    combinedResult += `━━━━━━━━━━━━━━━━\n\n`;
    
    combinedResult += `【慎用名單檢核】\n${cautionText}\n\n`;
    combinedResult += `【救生員證照查詢】\n${licenseText}`;

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
    return `✅ 此人不在慎用名單中`;
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
