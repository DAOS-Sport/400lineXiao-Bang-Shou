/**
 * Google Apps Script - 滿意度調查自動推送
 * 
 * 使用方式：
 * 1. 打開 Google Sheet
 * 2. 點選「擴充功能」→「Apps Script」
 * 3. 把這段程式碼貼上去（取代原有內容）
 * 4. 修改下方 CONFIG 設定（確認欄位對應）
 * 5. 點「儲存」
 * 6. 點選左側「觸發條件」（鬧鐘圖示）
 * 7. 點右下角「+ 新增觸發條件」
 * 8. 設定：
 *    - 選擇要執行的功能：onFormSubmit
 *    - 選取事件來源：試算表
 *    - 選取事件類型：提交表單時
 * 9. 按「儲存」，完成！
 * 
 * ⚠️ 重要：請確認 CONFIG 中的欄位索引是否正確
 *    - 如果你的 Google Sheet 第一欄 (A欄) 是「時間戳記」→ 使用預設值不用改
 *    - 如果你的 Google Sheet 第一欄 (A欄) 就是「場館」→ 把 HAS_TIMESTAMP 改成 false
 */

// ========== 設定區 ==========
var CONFIG = {
  WEBHOOK_URL: 'https://line-bot-assistant-ronchen2.replit.app/api/survey-webhook',
  SURVEY_TOKEN: 'daos-survey-2025',
  HAS_TIMESTAMP: true  // Google 表單通常會自動加時間戳記在第一欄，設 true；若沒有時間戳記欄，設 false
};
// ============================

function onFormSubmit(e) {
  try {
    var values = e.values;
    var offset = CONFIG.HAS_TIMESTAMP ? 1 : 0;
    
    var data = {
      timestamp: CONFIG.HAS_TIMESTAMP ? values[0] : new Date().toISOString(),
      facility: values[offset] || '',
      purpose: values[offset + 1] || '',
      courseVariety: values[offset + 2] || '',
      serviceAttitude: values[offset + 3] || '',
      cleanliness: values[offset + 4] || '',
      equipment: values[offset + 5] || '',
      teachingStaff: values[offset + 6] || '',
      suggestion: values[offset + 7] || ''
    };
    
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-survey-token': CONFIG.SURVEY_TOKEN
      },
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    Logger.log('推送成功: ' + response.getContentText());
    
  } catch (error) {
    Logger.log('推送失敗: ' + error.toString());
  }
}

/**
 * 手動測試用 - 在 Apps Script 中選擇此功能並按「執行」
 */
function testWebhook() {
  var data = {
    timestamp: new Date().toISOString(),
    facility: '竹科戶外游泳池',
    purpose: '游泳',
    courseVariety: '滿意',
    serviceAttitude: '非常滿意',
    cleanliness: '滿意',
    equipment: '普通',
    teachingStaff: '滿意',
    suggestion: '這是測試訊息，請忽略'
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-survey-token': CONFIG.SURVEY_TOKEN
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
  Logger.log('測試結果: ' + response.getContentText());
}
