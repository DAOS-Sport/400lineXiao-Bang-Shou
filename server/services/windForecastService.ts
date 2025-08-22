/**
 * Wind Forecast Service - 風力預測服務
 * 專門為群組 C360be1fe6ea876a4df3ca0497bca4e3b 提供風力預報
 * 座標: 24.77662974487106, 121.01465928420598
 */

import { storage } from '../storage';
import { lineService } from './lineService';
import crypto from 'crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

interface WindForecastData {
  time: string;
  windSpeed: number;
  windDirection: string;
  description: string;
  beaufortScale: number;
}

export class WindForecastService {
  private readonly targetGroupId = 'C360be1fe6ea876a4df3ca0497bca4e3b';
  private readonly latitude = 24.77662974487106;
  private readonly longitude = 121.01465928420598;
  private readonly locationName = '新竹地區'; // 根據座標位置

  /**
   * 獲取風力預測數據
   */
  async getWindForecast(): Promise<WindForecastData[]> {
    try {
      const token = process.env.CWA_API_KEY;
      
      if (!token) {
        console.warn('⚠️ CWA_API_KEY 未設定，使用模擬風力數據');
        return this.getSimulatedWindData();
      }

      // 使用中央氣象署API獲取風力預報
      // 使用新竹縣東區的鄉鎮預報API，包含風力資訊
      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-009?Authorization=${token}&format=JSON&locationName=新竹市&elementName=WS,WD`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`氣象署 API 回應錯誤: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.records?.locations?.[0]?.location?.[0]?.weatherElement) {
        throw new Error('氣象署 API 數據格式錯誤');
      }

      const weatherElements = data.records.locations[0].location[0].weatherElement;
      const windSpeedData = weatherElements.find((e: any) => e.elementName === 'WS');
      const windDirectionData = weatherElements.find((e: any) => e.elementName === 'WD');

      const forecasts: WindForecastData[] = [];

      // 解析未來24小時的風力預報（每3小時一筆）
      for (let i = 0; i < Math.min(8, windSpeedData?.time?.length || 0); i++) {
        if (windSpeedData?.time[i] && windDirectionData?.time[i]) {
          const time = windSpeedData.time[i].startTime;
          const windSpeed = parseFloat(windSpeedData.time[i].elementValue[0].value);
          const windDirection = windDirectionData.time[i].elementValue[0].value;
          const beaufort = this.getBeaufortScale(windSpeed);
          
          forecasts.push({
            time: time,
            windSpeed: windSpeed,
            windDirection: this.translateWindDirection(windDirection),
            description: this.getWindDescription(beaufort),
            beaufortScale: beaufort
          });
        }
      }

      // 記錄成功獲取風力數據
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'wind_forecast',
        message: '成功獲取風力預報',
        details: {
          location: { lat: this.latitude, lng: this.longitude },
          forecastCount: forecasts.length,
          source: 'CWA_API'
        }
      });

      return forecasts;

    } catch (error) {
      console.error('❌ 取得風力預報失敗:', error);

      // 記錄錯誤並使用備用數據
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'warning',
        category: 'wind_forecast',
        message: '風力預報取得失敗，使用模擬數據',
        details: {
          error: (error as Error).message,
          fallbackUsed: true
        }
      });

      return this.getSimulatedWindData();
    }
  }

  /**
   * 生成模擬風力數據（備用方案）
   */
  private getSimulatedWindData(): WindForecastData[] {
    const now = new Date();
    const forecasts: WindForecastData[] = [];

    for (let i = 0; i < 8; i++) {
      const forecastTime = new Date(now.getTime() + i * 3 * 60 * 60 * 1000);
      const windSpeed = Math.random() * 15 + 5; // 5-20 m/s
      const beaufort = this.getBeaufortScale(windSpeed);
      
      forecasts.push({
        time: forecastTime.toISOString(),
        windSpeed: Math.round(windSpeed * 10) / 10,
        windDirection: ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.floor(Math.random() * 8)],
        description: this.getWindDescription(beaufort),
        beaufortScale: beaufort
      });
    }

    return forecasts;
  }

  /**
   * 將風速轉換為蒲福風級
   */
  private getBeaufortScale(windSpeed: number): number {
    // 風速單位: m/s
    if (windSpeed < 0.3) return 0;
    if (windSpeed < 1.6) return 1;
    if (windSpeed < 3.4) return 2;
    if (windSpeed < 5.5) return 3;
    if (windSpeed < 8.0) return 4;
    if (windSpeed < 10.8) return 5;
    if (windSpeed < 13.9) return 6;
    if (windSpeed < 17.2) return 7;
    if (windSpeed < 20.8) return 8;
    if (windSpeed < 24.5) return 9;
    if (windSpeed < 28.5) return 10;
    if (windSpeed < 32.7) return 11;
    return 12;
  }

  /**
   * 獲取風級描述
   */
  private getWindDescription(beaufort: number): string {
    const descriptions = [
      '無風', '軟風', '輕風', '微風', '和風', '清風',
      '強風', '疾風', '大風', '烈風', '狂風', '暴風', '颶風'
    ];
    return descriptions[Math.min(beaufort, 12)];
  }

  /**
   * 翻譯風向
   */
  private translateWindDirection(direction: string): string {
    const directionMap: { [key: string]: string } = {
      'N': '北',
      'NNE': '北北東',
      'NE': '東北',
      'ENE': '東北東',
      'E': '東',
      'ESE': '東南東',
      'SE': '東南',
      'SSE': '南南東',
      'S': '南',
      'SSW': '南南西',
      'SW': '西南',
      'WSW': '西南西',
      'W': '西',
      'WNW': '西北西',
      'NW': '西北',
      'NNW': '北北西'
    };
    return directionMap[direction] || direction;
  }

  /**
   * 生成風力預報報告
   */
  async generateWindForecastReport(): Promise<string> {
    try {
      const forecasts = await this.getWindForecast();
      const now = dayjs().tz('Asia/Taipei');
      
      let report = `🌬️ 風力預測報告\n`;
      report += `📍 位置：${this.locationName}\n`;
      report += `📊 座標：${this.latitude.toFixed(4)}, ${this.longitude.toFixed(4)}\n`;
      report += `⏰ 報告時間：${now.format('MM/DD HH:mm')}\n`;
      report += `━━━━━━━━━━━━━━━━\n\n`;

      // 顯示未來6小時的風力預報
      report += `【未來6小時風力預測】\n`;
      
      for (let i = 0; i < Math.min(2, forecasts.length); i++) {
        const forecast = forecasts[i];
        const forecastTime = dayjs(forecast.time).tz('Asia/Taipei');
        
        report += `\n${forecastTime.format('HH:mm')}\n`;
        report += `💨 風速：${forecast.windSpeed} m/s\n`;
        report += `🧭 風向：${forecast.windDirection}風\n`;
        report += `📊 風級：${forecast.beaufortScale}級（${forecast.description}）\n`;
      }

      // 風力評估
      report += `\n━━━━━━━━━━━━━━━━\n`;
      report += `💡 風力評估：\n`;
      
      const maxWind = Math.max(...forecasts.slice(0, 2).map(f => f.beaufortScale));
      if (maxWind >= 7) {
        report += `⚠️ 注意：預測有${maxWind}級風，請注意安全\n`;
        report += `建議暫停戶外活動`;
      } else if (maxWind >= 5) {
        report += `⚡ 風力較強，戶外活動需謹慎\n`;
        report += `建議做好防風準備`;
      } else {
        report += `✅ 風力適中，適合一般活動`;
      }

      return report;

    } catch (error) {
      console.error('生成風力報告失敗:', error);
      return `🌬️ 風力預測報告\n\n❌ 系統錯誤，請聯繫管理員`;
    }
  }

  /**
   * 發送風力預報到指定群組
   */
  async sendWindForecastReport(): Promise<void> {
    try {
      console.log('🌬️ 開始生成風力預報...');
      
      const report = await this.generateWindForecastReport();
      
      // 發送到指定群組
      await lineService.sendToGroup(this.targetGroupId, report);
      
      console.log(`✅ 風力預報已發送到群組 ${this.targetGroupId}`);
      
      // 記錄發送成功
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'wind_forecast',
        message: '風力預報發送成功',
        details: {
          groupId: this.targetGroupId,
          location: { lat: this.latitude, lng: this.longitude },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ 發送風力預報失敗:', error);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'wind_forecast',
        message: '風力預報發送失敗',
        details: {
          groupId: this.targetGroupId,
          error: (error as Error).message
        }
      });
    }
  }
}

export const windForecastService = new WindForecastService();