import { spawn } from 'child_process';
import path from 'path';

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
  private readonly scriptPath: string;

  constructor() {
    this.scriptPath = path.join(process.cwd(), 'scripts', 'lifeguard_query.py');
  }

  async queryLicense(idCard: string): Promise<LicenseQueryResult> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: '查詢超時（15秒）' });
      }, 20000);

      try {
        // 直接使用 python3 執行（依賴已透過 Nix 安裝到環境）
        // 設置 PYTHONPATH 以包含 nix 安裝的套件
        const pythonPath = [
          '/nix/store/nicjg1xpimrn3zfbndwix25gphv88zlx-python3.11-requests-2.31.0/lib/python3.11/site-packages',
          '/nix/store/b121a8zifm7qr2qcxc7hrkqn3qgfbm0l-python3.11-beautifulsoup4-4.12.3/lib/python3.11/site-packages',
          '/nix/store/4pd17akwf211chzgjg782wi9azr30rfz-python3.11-soupsieve-2.5/lib/python3.11/site-packages',
          '/nix/store/y84qvvzrarmks4k7qb9ras6qfsxksnds-python3.11-idna-3.7/lib/python3.11/site-packages',
          '/nix/store/2sd6mncv58k6065w8cf9b5pmagf2jc2f-python3.11-urllib3-2.2.1/lib/python3.11/site-packages',
          '/nix/store/jrr6l56xssk4szz6xxk9mxhk8pxwghhg-python3.11-charset-normalizer-3.3.2/lib/python3.11/site-packages',
          '/nix/store/qgglxpjjja3qpxi6mayabj417n16d3lh-python3.11-certifi-2024.02.02/lib/python3.11/site-packages',
          process.env.PYTHONPATH
        ].filter(Boolean).join(':');

        const pythonProcess = spawn('python3', [this.scriptPath, idCard], {
          cwd: process.cwd(),
          env: { ...process.env, PYTHONPATH: pythonPath }
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', (code) => {
          clearTimeout(timeout);
          
          if (code !== 0) {
            console.error('Python script error:', stderr);
            resolve({ success: false, error: '外部查詢失敗' });
            return;
          }

          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (parseError) {
            if (stdout.includes('查無資料')) {
              resolve({ success: false, error: '查無資料，證照可能已過期或無效' });
            } else if (stdout.includes('查詢成功')) {
              const licenses = this.parseTextOutput(stdout);
              resolve({ success: true, data: licenses });
            } else {
              resolve({ success: false, error: '解析結果失敗' });
            }
          }
        });

        pythonProcess.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Failed to start Python process:', err);
          resolve({ success: false, error: '無法啟動查詢程序' });
        });

      } catch (error) {
        clearTimeout(timeout);
        console.error('Query license error:', error);
        resolve({ success: false, error: '查詢過程發生錯誤' });
      }
    });
  }

  private parseTextOutput(output: string): LicenseInfo[] {
    const licenses: LicenseInfo[] = [];
    const lines = output.split('\n');
    
    let currentLicense: Partial<LicenseInfo> = {};
    
    for (const line of lines) {
      if (line.includes('姓名：')) {
        currentLicense.name = line.split('姓名：')[1]?.trim() || '';
      } else if (line.includes('資格：')) {
        currentLicense.licenseType = line.split('資格：')[1]?.trim() || '';
      } else if (line.includes('證號：')) {
        currentLicense.licenseNo = line.split('證號：')[1]?.trim() || '';
      } else if (line.includes('效期：')) {
        currentLicense.expiryDate = line.split('效期：')[1]?.trim() || '';
        if (currentLicense.name) {
          licenses.push(currentLicense as LicenseInfo);
          currentLicense = {};
        }
      }
    }
    
    return licenses;
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
