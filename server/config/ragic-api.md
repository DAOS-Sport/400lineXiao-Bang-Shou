# RAGIC API 配置文檔

## API 端點配置

### 基礎端點
```
https://ap7.ragic.com/xinsheng/ragicforms4/20004?v=3&api
```

### 環境變數設定
```bash
RAGIC_DOMAIN=ap7.ragic.com
RAGIC_DATABASE_ID=xinsheng/ragicforms4/20004
RAGIC_API_KEY=<使用最新的API金鑰>
```

## API 調用格式

### 1. 基礎查詢
```
GET https://ap7.ragic.com/xinsheng/ragicforms4/20004?v=3&api&limit=10
Authorization: <API_KEY>
Content-Type: application/json
```

### 2. 員工資料查詢 (by LINE ID)
```
GET https://ap7.ragic.com/xinsheng/ragicforms4/20004?v=3&api&where=1003633,eq,<LINE_ID>
Authorization: <API_KEY>
Content-Type: application/json
```

### 3. 連線測試
```
GET https://ap7.ragic.com/xinsheng/ragicforms4/20004?v=3&api&limit=1
Authorization: <API_KEY>
Content-Type: application/json
```

## 欄位對應

| 欄位名稱 | 欄位 ID | 說明 |
|---------|--------|------|
| LINE ID | 1003633 | 員工的 LINE 用戶 ID |
| 員工編號 | 3000935 | 公司內部員工編號 |

## 權限設定

### 存取權限頁面
```
https://ap7.ragic.com/xinsheng/home/1?PAGEID=5sq
```

### 需要設定
1. API KEY 對應的用戶權限設為 "Viewer" 或 "Admin"
2. 確保用戶不是 Guest 身份
3. 工作表層級權限允許 API 存取

## API 回應格式

### 成功回應
```json
[
  {
    "1003633": "U1377e3b691add6a9b93699eb02dea502",
    "3000935": "EMP001",
    "姓名": "員工姓名",
    "部門": "部門名稱"
  }
]
```

### 錯誤回應
```json
{
  "status": "ERROR",
  "msg": "錯誤訊息",
  "code": 106
}
```

## 使用須知

1. **API 版本**: 必須使用 `v=3` 參數
2. **認證**: 使用 Authorization Header 傳送 API KEY
3. **編碼**: LINE ID 需要使用 URL 編碼
4. **權限**: 確保 API KEY 對應用戶有適當權限
5. **錯誤處理**: 檢查回應中的 status 和 code 欄位

## 調度服務整合

此 API 配置用於以下服務：
- `RagicService.getEmployeeByLineId()` - 員工資料查詢
- `RagicService.testConnection()` - 連線測試
- LINE Bot ID 指令處理