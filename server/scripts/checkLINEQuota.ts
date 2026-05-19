#!/usr/bin/env tsx
// 檢查 LINE Bot 配額和狀態

import { Client } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

const client = new Client(config);

async function checkLINEQuota() {
  console.log('🔍 檢查 LINE Bot 配額狀態...');
  
  try {
    // 1. 測試基本連接 - 獲取 Bot 資訊
    console.log('\n1️⃣ 測試 Bot 基本資訊...');
    try {
      const botInfo = await client.getBotInfo();
      console.log('✅ Bot 連接正常');
      console.log('📋 Bot 資訊:', {
        displayName: botInfo.displayName,
        userId: botInfo.userId,
        basicId: botInfo.basicId,
        pictureUrl: botInfo.pictureUrl
      });
    } catch (error: any) {
      console.log('❌ Bot 資訊獲取失敗:', error.message);
      if (error.statusCode === 429 && error.originalError?.response?.data?.message?.includes('monthly limit')) {
        console.log('⚠️  確認：月度配額已用完');
        return;
      }
    }

    // 2. 測試一個簡單的 API 呼叫
    console.log('\n2️⃣ 測試 API 配額狀態...');
    try {
      // 使用一個輕量級的 API 測試
      const testUserId = 'U' + '0'.repeat(32); // 假的用戶ID用於測試
      await client.getProfile(testUserId);
      console.log('✅ API 配額充足');
    } catch (error: any) {
      console.log('📊 API 測試結果:', {
        statusCode: error.statusCode,
        message: error.message
      });
      
      const response = error.originalError?.response;
      if (response) {
        console.log('📋 Response 詳情:', {
          status: response.status,
          statusText: response.statusText,
          data: response.data
        });
        
        // 檢查是否有配額相關的 headers
        const headers = response.headers || {};
        const quotaHeaders = Object.keys(headers)
          .filter(key => key.toLowerCase().includes('limit') || key.toLowerCase().includes('quota'))
          .reduce<Record<string, unknown>>((obj, key) => {
            obj[key] = headers[key];
            return obj;
          }, {});
          
        if (Object.keys(quotaHeaders).length > 0) {
          console.log('📊 配額相關 Headers:', quotaHeaders);
        }
      }
      
      if (error.statusCode === 429) {
        const responseData = error.originalError?.response?.data;
        if (responseData?.message?.includes('monthly limit')) {
          console.log('❌ 確認：月度配額已達上限');
          console.log('💡 建議：');
          console.log('   - 檢查 LINE 開發者後台的使用量統計');
          console.log('   - 確認升級是否已生效');
          console.log('   - 等待下個月配額重置');
        } else if (responseData?.message?.includes('rate limit')) {
          console.log('⚠️  這是頻率限制，不是配額限制');
        }
      } else if (error.statusCode === 404) {
        console.log('✅ API 正常運作（404 是預期的，因為測試用戶不存在）');
        console.log('✅ 配額狀態：正常');
      }
    }

    // 3. 提供檢查建議
    console.log('\n3️⃣ 如何檢查配額狀態：');
    console.log('🔗 LINE 開發者控制台：https://developers.line.biz/');
    console.log('📊 在控制台中檢查：');
    console.log('   - Messaging API usage (訊息使用量)');
    console.log('   - Monthly quota (月度配額)');
    console.log('   - Billing information (帳單資訊)');

  } catch (error) {
    console.error('❌ 檢查過程發生錯誤:', error);
  }
  
  console.log('\n✅ 配額檢查完成');
  process.exit(0);
}

// 執行檢查
checkLINEQuota();
