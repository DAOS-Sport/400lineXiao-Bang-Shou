import * as cheerio from 'cheerio';
import https from 'https';
import http from 'http';

interface LicenseInfo {
  name: string;
  licenseType: string;
  licenseNo: string;
  expiryDate: string;
}

interface LicenseQueryResult {
  success: boolean;
  data?: LicenseInfo[];
  error?: string;
}

export class LifeguardLicenseService {
  private readonly queryUrl = 'https://isports.sa.gov.tw/Apps/LGM/LGM09/LGM0970Q_01V1.aspx?MENU_PRG_CD=5&ITEM_PRG_CD=1';
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  // isports.sa.gov.tw 的 SSL 證書鏈不完整，需要跳過驗證
  // 此 agent 僅用於此政府網站查詢，不應用於其他用途
  private readonly agent = new https.Agent({ rejectUnauthorized: false });

  private httpRequest(url: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'isports.sa.gov.tw') {
        reject(new Error('此 HTTP client 僅限查詢 isports.sa.gov.tw'));
        return;
      }
      const reqOptions: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        agent: this.agent,
        timeout: options.timeout || 15000,
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: data,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('請求超時'));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async queryLicense(idCard: string): Promise<LicenseQueryResult> {
    try {
      console.log(`🔍 開始查詢救生員證照 (Node.js): ${this.maskIdCard(idCard)}`);

      const getRes = await this.httpRequest(this.queryUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Referer': this.queryUrl,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
      });

      if (getRes.statusCode !== 200) {
        console.error(`❌ GET 請求失敗: ${getRes.statusCode}`);
        return { success: false, error: `網站回應異常 (${getRes.statusCode})` };
      }

      const cookies = (getRes.headers['set-cookie'] || [])
        .map(c => c.split(';')[0])
        .join('; ');

      const $ = cheerio.load(getRes.body);
      const payload: Record<string, string> = {};
      $('input[type="hidden"]').each((_, el) => {
        const name = $(el).attr('name');
        const value = $(el).attr('value') || '';
        if (name) payload[name] = value;
      });

      payload['ctl00$IsportContent$TYPE'] = 'IDN';
      payload['ctl00$IsportContent$Q_LG_LIC_HOLDER_IDN'] = idCard;
      payload['ctl00$IsportContent$btnQuery'] = '查詢';
      payload['ctl00$IsportContent$Q_LG_LIC_EXAM_UNIT_CD'] = '';
      payload['ctl00$IsportContent$Q_LG_LIC_EXAM_TP_CD'] = '';

      const formBody = Object.entries(payload)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      console.log(`📡 POST 查詢救生員證照...`);
      const postRes = await this.httpRequest(this.queryUrl, {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          'Referer': this.queryUrl,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookies,
        },
        body: formBody,
        timeout: 15000,
      });

      if (postRes.statusCode !== 200) {
        console.error(`❌ POST 請求失敗: ${postRes.statusCode}`);
        return { success: false, error: `查詢請求失敗 (${postRes.statusCode})` };
      }

      const $result = cheerio.load(postRes.body);
      const grid = $result('table#IsportContent_DataGrid');

      if (grid.length > 0) {
        const rows = grid.find('tr');
        if (rows.length > 1) {
          const results: LicenseInfo[] = [];
          rows.each((i, row) => {
            if (i === 0) return;
            const cols = $result(row).find('td');
            if (cols.length >= 6) {
              results.push({
                name: $result(cols[2]).text().trim(),
                licenseType: $result(cols[1]).text().trim(),
                licenseNo: $result(cols[3]).text().trim(),
                expiryDate: $result(cols[5]).text().trim(),
              });
            }
          });

          if (results.length > 0) {
            console.log(`✅ 救生員證照查詢成功，找到 ${results.length} 筆記錄`);
            return { success: true, data: results };
          }
        }
      }

      console.log(`ℹ️ 救生員證照查詢完成：此人未考取救生員證照`);
      return { success: true, data: [] };

    } catch (error: any) {
      console.error('❌ 救生員證照查詢錯誤:', error.message || error);
      return { success: false, error: `查詢過程發生錯誤: ${error.message || '未知錯誤'}` };
    }
  }

  formatLicenseResult(result: LicenseQueryResult, idCard: string): string {
    if (!result.success) {
      if (result.error === '此人未考取救生員證照' || result.error === '查無資料') {
        return `ℹ️ 救生員證照查詢結果\n身分證：${this.maskIdCard(idCard)}\n此人未考取救生員證照`;
      }
      return `❌ 救生員證照查詢失敗\n身分證：${this.maskIdCard(idCard)}\n原因：${result.error || '未知錯誤'}`;
    }

    if (!result.data || result.data.length === 0) {
      return `ℹ️ 救生員證照查詢結果\n身分證：${this.maskIdCard(idCard)}\n此人未考取救生員證照`;
    }

    let response = `✅ 救生員證照查詢結果\n身分證：${this.maskIdCard(idCard)}\n`;
    response += `━━━━━━━━━━━━━━━━\n`;

    result.data.forEach((license, index) => {
      response += `\n📜 證照 #${index + 1}\n`;
      response += `姓名：${license.name}\n`;
      response += `資格：${license.licenseType}\n`;
      response += `證號：${license.licenseNo}\n`;
      response += `效期：${this.formatExpiryDate(license.expiryDate)}\n`;
      
      const isExpired = this.checkExpired(license.expiryDate);
      if (isExpired) {
        response += `⚠️ 狀態：已過期\n`;
      } else {
        response += `✅ 狀態：有效\n`;
      }
    });

    return response;
  }

  private maskIdCard(idCard: string): string {
    if (idCard.length < 4) return idCard;
    return idCard.substring(0, 1) + '***' + idCard.substring(idCard.length - 4);
  }

  private formatExpiryDate(dateStr: string): string {
    if (dateStr.length === 7) {
      const year = parseInt(dateStr.substring(0, 3)) + 1911;
      const month = dateStr.substring(3, 5);
      const day = dateStr.substring(5, 7);
      return `${year}/${month}/${day}`;
    }
    return dateStr;
  }

  private checkExpired(dateStr: string): boolean {
    try {
      let year: number, month: number, day: number;
      
      if (dateStr.length === 7) {
        year = parseInt(dateStr.substring(0, 3)) + 1911;
        month = parseInt(dateStr.substring(3, 5));
        day = parseInt(dateStr.substring(5, 7));
      } else {
        return false;
      }
      
      const expiryDate = new Date(year, month - 1, day);
      return expiryDate < new Date();
    } catch {
      return false;
    }
  }
}

export const lifeguardLicenseService = new LifeguardLicenseService();
