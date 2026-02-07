/**
 * Google Apps Script - 滿意度調查自動推送（SurveyCake 版）
 * 
 * 使用方式：
 * 1. 打開 Google Sheet
 * 2. 點選「擴充功能」→「Apps Script」
 * 3. 把這段程式碼貼上去（取代原有內容）
 * 4. 點「儲存」
 * 5. 點選左側「觸發條件」（鬧鐘圖示）
 * 6. 刪除舊的觸發條件
 * 7. 點右下角「+ 新增觸發條件」
 * 8. 設定：
 *    - 選擇要執行的功能：onSheetChange
 *    - 選取事件來源：試算表
 *    - 選取事件類型：變更時
 * 9. 按「儲存」，完成！
 */

// ========== 設定區 ==========
var CONFIG = {
  WEBHOOK_URL: 'https://line-bot-assistant-ronchen2.replit.app/api/survey-webhook',
  SURVEY_TOKEN: 'daos-survey-2025',
  SHEET_NAME: '工作表1'  // 你的工作表名稱，確認一下是否正確
};
// ============================

function onSheetChange(e) {
  try {
    if (!e || !e.changeType) {
      Logger.log('無變更事件');
      return;
    }

    // 只處理新增列或編輯的情況
    if (e.changeType !== 'INSERT_ROW' && e.changeType !== 'EDIT' && e.changeType !== 'OTHER') {
      Logger.log('非資料變更，略過: ' + e.changeType);
      return;
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      // 如果找不到指定工作表，用第一個工作表
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return; // 沒有資料（只有標題列）

    // 讀取最新一行的 A~H 欄
    var values = sheet.getRange(lastRow, 1, 1, 8).getValues()[0];

    var facility = values[0] ? values[0].toString().trim() : '';
    if (!facility) {
      Logger.log('場館欄位為空，略過');
      return;
    }

    // 檢查是否已經推送過（用 PropertiesService 記錄）
    var props = PropertiesService.getScriptProperties();
    var lastSentKey = 'lastSentRow';
    var lastSentRow = parseInt(props.getProperty(lastSentKey) || '0');
    
    if (lastRow <= lastSentRow) {
      Logger.log('第 ' + lastRow + ' 行已推送過，略過');
      return;
    }

    var data = {
      timestamp: new Date().toISOString(),
      facility: facility,
      purpose: values[1] ? values[1].toString() : '',
      courseVariety: values[2] ? values[2].toString() : '',
      serviceAttitude: values[3] ? values[3].toString() : '',
      cleanliness: values[4] ? values[4].toString() : '',
      equipment: values[5] ? values[5].toString() : '',
      teachingStaff: values[6] ? values[6].toString() : '',
      suggestion: values[7] ? values[7].toString() : ''
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
    Logger.log('第 ' + lastRow + ' 行推送成功: ' + response.getContentText());

    // 記錄已推送的行號
    props.setProperty(lastSentKey, lastRow.toString());

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

/**
 * 手動推送最新一行（如果自動推送沒觸發，可以手動執行這個）
 */
function pushLatestRow() {
  // 強制重置已推送記錄，讓最新一行重新推送
  var props = PropertiesService.getScriptProperties();
  props.setProperty('lastSentRow', '0');
  
  onSheetChange({ changeType: 'OTHER' });
}
