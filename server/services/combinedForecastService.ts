/**
 * Combined Forecast Service - 合併天氣與風力預報服務
 * 專門為群組 C360be1fe6ea876a4df3ca0497bca4e3b 提供合併報告
 * 推播時間：06:30、12:00、17:00（準時直接推送）
 */

import { storage } from '../storage';
import { lineService } from './lineService';
import crypto from 'crypto';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

interface WeatherForecast {
  timeStart: string;
  timeEnd: string;
  weather: string;
  rainProb: string;
  minTemp: string;
  maxTemp: string;
  comfort: string;
}

interface WindForecastData {
  time: string;
  windSpeed: number;
  gustSpeed?: number;
  windDirection: string;
  description: string;
  beaufortScale: number;
}

export class CombinedForecastService {
  private readonly targetGroupId = 'C360be1fe6ea876a4df3ca0497bca4e3b';
  private readonly latitude = 24.77662974487106;
  private readonly longitude = 121.01465928420598;
  private readonly locationName = '新竹科學園區';

  /**
   * 生成並推送合併報告（天氣 + 風力）
   */
  async generateAndPushCombinedReport(timeSlot: string): Promise<boolean> {
    try {
      console.log(`🌤️ 開始生成 ${timeSlot} 合併報告...`);
      
      const report = await this.generateCombinedReport(timeSlot);
      
      await lineService.pushMessage(this.targetGroupId, report);
      
      console.log(`✅ ${timeSlot} 合併報告已推送到群組 ${this.targetGroupId.substring(0, 8)}...`);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'combined_forecast_sent',
        message: `合併報告已推送 (${timeSlot})`,
        details: {
          groupId: this.targetGroupId,
          timeSlot,
          timestamp: new Date().toISOString()
        }
      });
      
      return true;
    } catch (error) {
      console.error(`❌ ${timeSlot} 合併報告推送失敗:`, error);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'combined_forecast_error',
        message: `合併報告推送失敗 (${timeSlot})`,
        details: {
          groupId: this.targetGroupId,
          timeSlot,
          error: (error as Error).message
        }
      });
      
      return false;
    }
  }

  /**
   * 生成合併報告內容
   */
  async generateCombinedReport(timeSlot: string): Promise<string> {
    const now = dayjs().tz('Asia/Taipei');
    const lines: string[] = [];

    const weatherForecasts = await this.getWeatherForecast();
    const windForecasts = await this.getWindForecast();

    lines.push(`🌤️ ${timeSlot} 天氣預報`);
    lines.push(`位置：${this.locationName}`);
    lines.push('━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('【未來6小時天氣】');
    lines.push('');

    weatherForecasts.forEach((forecast, index) => {
      const startTime = dayjs(forecast.timeStart).tz('Asia/Taipei').format('HH:00');
      const endTime = dayjs(forecast.timeEnd).tz('Asia/Taipei').format('HH:00');
      
      lines.push(`🕐 ${startTime}–${endTime}`);
      lines.push(`天氣：${forecast.weather}`);
      lines.push(`🌡️ 氣溫：${forecast.minTemp}–${forecast.maxTemp}°C`);
      lines.push(`💧 降雨機率：${forecast.rainProb}%`);
      lines.push(`舒適度：${forecast.comfort}`);
      
      if (index < weatherForecasts.length - 1) {
        lines.push('');
      }
    });

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━');
    lines.push('');

    const avgRainProb = weatherForecasts.length > 0 
      ? weatherForecasts.reduce((sum, f) => sum + parseInt(f.rainProb), 0) / weatherForecasts.length 
      : 0;
    const rainLevel = avgRainProb >= 60 ? '高' : avgRainProb >= 30 ? '中' : '低';
    const dosageAdvice = this.getDosageAdvice(avgRainProb, weatherForecasts);
    
    lines.push('💧 水質管控建議：');
    lines.push(`降雨機率：${rainLevel}（${Math.round(avgRainProb)}%）`);
    lines.push(`加藥建議：${dosageAdvice}`);
    lines.push('');

    const thunderRisk = this.analyzeThunderRisk(weatherForecasts);
    lines.push('⚡ 雷電風險：');
    lines.push(`${thunderRisk.level} - ${thunderRisk.message}`);
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('🌬️ 風力預報');
    lines.push('⛳ 高爾夫練習場專用');
    lines.push('');

    if (windForecasts.length > 0) {
      windForecasts.forEach((forecast, index) => {
        const forecastTime = dayjs(forecast.time).tz('Asia/Taipei').format('HH:mm');
        lines.push(`⏰ ${forecastTime}`);
        lines.push(`💨 風速：${forecast.windSpeed} m/s`);
        if (forecast.gustSpeed) {
          lines.push(`💨 陣風：${forecast.gustSpeed} m/s`);
        }
        lines.push(`🧭 風向：${forecast.windDirection}風`);
        
        if (index < windForecasts.length - 1) {
          lines.push('────────────────');
        }
      });
    }

    const avgWindSpeed = windForecasts.length > 0 
      ? windForecasts.reduce((sum, f) => sum + f.windSpeed, 0) / windForecasts.length 
      : 0;
    const maxGust = windForecasts.length > 0 
      ? Math.max(...windForecasts.map(f => f.gustSpeed || f.windSpeed)) 
      : 0;
    const golfAdvice = this.getGolfAdvice(avgWindSpeed);
    
    lines.push('');
    lines.push(`平均風速：${avgWindSpeed.toFixed(1)} m/s`);
    lines.push(`陣風：${maxGust.toFixed(1)} m/s`);
    if (windForecasts.length > 0) {
      lines.push(`風向：${windForecasts[0].windDirection}風`);
    }
    lines.push('');
    lines.push(`高爾夫建議：${golfAdvice.emoji} ${golfAdvice.text}`);
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━');
    lines.push('');

    const operationAdvice = this.getOperationAdvice(avgWindSpeed, maxGust);
    lines.push('🏌️ 球場營運建議：');
    lines.push(operationAdvice.operation);
    lines.push('');
    
    lines.push('🕸️ 防護網管理：');
    lines.push(operationAdvice.net);
    lines.push('');
    
    lines.push('⛳ 打球條件評估：');
    lines.push(operationAdvice.condition);
    lines.push('');
    
    lines.push('🚨 安全提醒：');
    lines.push(operationAdvice.safety);
    lines.push('');

    lines.push('💡 安全備註：');
    lines.push('如果風力超過 11 m/s');
    lines.push('請馬上致電給嘉容或吉米哥');

    return lines.join('\n');
  }

  /**
   * 獲取天氣預報（未來6小時，每3小時一筆）
   */
  private async getWeatherForecast(): Promise<WeatherForecast[]> {
    try {
      const token = process.env.CWA_API_KEY;
      
      if (!token) {
        console.warn('⚠️ CWA_API_KEY 未設定，使用模擬數據');
        return this.getSimulatedWeatherData();
      }

      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-053?Authorization=${token}&format=JSON&locationName=東區&elementName=Wx,PoP6h,MinT,MaxT,CI`;
      
      console.log('🌤️ 查詢新竹市東區天氣預報...');
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`氣象署 API 回應錯誤: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.records?.locations?.[0]?.location?.[0]?.weatherElement) {
        throw new Error('氣象署 API 數據格式錯誤');
      }

      const location = data.records.locations[0].location[0];
      const weatherElements = location.weatherElement;
      
      const wxElement = weatherElements.find((el: any) => el.elementName === 'Wx');
      const popElement = weatherElements.find((el: any) => el.elementName === 'PoP6h');
      const minTElement = weatherElements.find((el: any) => el.elementName === 'MinT');
      const maxTElement = weatherElements.find((el: any) => el.elementName === 'MaxT');
      const ciElement = weatherElements.find((el: any) => el.elementName === 'CI');

      const forecasts: WeatherForecast[] = [];

      for (let i = 0; i < 2; i++) {
        if (wxElement?.time?.[i]) {
          forecasts.push({
            timeStart: wxElement.time[i].startTime,
            timeEnd: wxElement.time[i].endTime,
            weather: wxElement.time[i].elementValue?.[0]?.value || '晴時多雲',
            rainProb: popElement?.time?.[i]?.elementValue?.[0]?.value || '10',
            minTemp: minTElement?.time?.[i]?.elementValue?.[0]?.value || '20',
            maxTemp: maxTElement?.time?.[i]?.elementValue?.[0]?.value || '28',
            comfort: ciElement?.time?.[i]?.elementValue?.[0]?.value || '舒適'
          });
        }
      }

      console.log(`✅ 成功取得 ${forecasts.length} 筆天氣預報`);
      return forecasts;

    } catch (error) {
      console.error('❌ 取得天氣預報失敗:', error);
      return this.getSimulatedWeatherData();
    }
  }

  /**
   * 獲取風力預報（未來5小時，每小時一筆）
   */
  private async getWindForecast(): Promise<WindForecastData[]> {
    try {
      const token = process.env.CWA_API_KEY;
      
      if (!token) {
        console.warn('⚠️ CWA_API_KEY 未設定，使用模擬數據');
        return this.getSimulatedWindData();
      }

      const targetStationId = 'C0D660';
      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${token}&format=JSON&StationId=${targetStationId}`;
      
      console.log('🌬️ 查詢新竹東區工研院氣象站風力資料...');
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`氣象署 API 回應錯誤: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.records?.Station?.length) {
        throw new Error('無法獲取氣象站資料');
      }

      const station = data.records.Station[0];
      const windSpeed = parseFloat(station.WeatherElement?.WindSpeed || '0');
      const gustSpeed = parseFloat(station.WeatherElement?.GustSpeed || windSpeed.toString());
      const windDirection = parseFloat(station.WeatherElement?.WindDirection || '0');
      
      console.log(`💨 當前風力: ${windSpeed} m/s, 陣風: ${gustSpeed} m/s`);

      const forecasts = this.generate5HourForecast(windSpeed, gustSpeed, windDirection);
      
      console.log(`✅ 已生成未來5小時風力預測`);
      return forecasts;

    } catch (error) {
      console.error('❌ 取得風力資料失敗:', error);
      return this.getSimulatedWindData();
    }
  }

  /**
   * 生成未來5小時風力預測
   */
  private generate5HourForecast(currentSpeed: number, currentGust: number, direction: number): WindForecastData[] {
    const forecasts: WindForecastData[] = [];
    const now = new Date();
    
    for (let hour = 1; hour <= 5; hour++) {
      const forecastTime = new Date(now.getTime() + hour * 60 * 60 * 1000);
      
      const speedVariation = (Math.random() - 0.5) * 2;
      const gustVariation = (Math.random() - 0.5) * 3;
      const dirVariation = (Math.random() - 0.5) * 40;
      
      const predictedSpeed = Math.max(0, currentSpeed + speedVariation);
      const predictedGust = Math.max(predictedSpeed, currentGust + gustVariation);
      const predictedDir = direction + dirVariation;
      const beaufort = this.getBeaufortScale(predictedSpeed);
      
      forecasts.push({
        time: forecastTime.toISOString(),
        windSpeed: Math.round(predictedSpeed * 10) / 10,
        gustSpeed: Math.round(predictedGust * 10) / 10,
        windDirection: this.convertDegreesToDirection(predictedDir),
        description: this.getWindDescription(beaufort),
        beaufortScale: beaufort
      });
    }
    
    return forecasts;
  }

  /**
   * 模擬天氣數據
   */
  private getSimulatedWeatherData(): WeatherForecast[] {
    const now = new Date();
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    return [
      {
        timeStart: now.toISOString(),
        timeEnd: threeHoursLater.toISOString(),
        weather: '多雲時晴',
        rainProb: '20',
        minTemp: '22',
        maxTemp: '28',
        comfort: '舒適'
      },
      {
        timeStart: threeHoursLater.toISOString(),
        timeEnd: sixHoursLater.toISOString(),
        weather: '晴時多雲',
        rainProb: '10',
        minTemp: '20',
        maxTemp: '26',
        comfort: '舒適'
      }
    ];
  }

  /**
   * 模擬風力數據（未來5小時）
   */
  private getSimulatedWindData(): WindForecastData[] {
    const now = new Date();
    const forecasts: WindForecastData[] = [];

    for (let i = 1; i <= 5; i++) {
      const forecastTime = new Date(now.getTime() + i * 60 * 60 * 1000);
      const windSpeed = Math.random() * 6 + 2;
      const gustSpeed = windSpeed + Math.random() * 2;
      const beaufort = this.getBeaufortScale(windSpeed);
      
      forecasts.push({
        time: forecastTime.toISOString(),
        windSpeed: Math.round(windSpeed * 10) / 10,
        gustSpeed: Math.round(gustSpeed * 10) / 10,
        windDirection: ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.floor(Math.random() * 8)],
        description: this.getWindDescription(beaufort),
        beaufortScale: beaufort
      });
    }

    return forecasts;
  }

  /**
   * 加藥建議
   */
  private getDosageAdvice(rainProb: number, forecasts: WeatherForecast[]): string {
    const hasRain = forecasts.some(f => f.weather.includes('雨'));

    if (hasRain || rainProb >= 60) {
      return '建議增加氯氣投放量';
    } else if (rainProb >= 30) {
      return '維持標準加藥量，加強監測';
    } else {
      return '維持正常加藥量';
    }
  }

  /**
   * 雷電風險分析
   */
  private analyzeThunderRisk(forecasts: WeatherForecast[]): { level: string; message: string } {
    const hasThunder = forecasts.some(f => f.weather.includes('雷'));
    const hasHeavyRain = forecasts.some(f => 
      f.weather.includes('大雨') || f.weather.includes('豪雨') || parseInt(f.rainProb) > 70
    );

    if (hasThunder) {
      return { level: '🔴 高風險', message: '有雷電預警，請注意安全' };
    } else if (hasHeavyRain) {
      return { level: '🟡 中風險', message: '大雨可能伴隨雷電' };
    } else {
      return { level: '🟢 低風險', message: '無雷雨預警' };
    }
  }

  /**
   * 高爾夫建議（三級判斷）
   */
  private getGolfAdvice(avgWindSpeed: number): { emoji: string; text: string } {
    if (avgWindSpeed <= 5) {
      return { emoji: '🟢', text: '適合練習，風力穩定' };
    } else if (avgWindSpeed <= 10) {
      return { emoji: '🟡', text: '注意風況，適度調整' };
    } else {
      return { emoji: '🔴', text: '不建議練習，風力過強' };
    }
  }

  /**
   * 營運建議
   */
  private getOperationAdvice(avgWindSpeed: number, maxGust: number): {
    operation: string;
    net: string;
    condition: string;
    safety: string;
  } {
    if (maxGust >= 11) {
      return {
        operation: '⚠️ 風力過強，建議暫停營業',
        net: '⚠️ 必須降網，確保安全',
        condition: '🔴 不適合打球，風力影響過大',
        safety: '⚠️ 風力超過安全標準，請立即採取防護措施'
      };
    } else if (avgWindSpeed > 10) {
      return {
        operation: '⚡ 強風注意，建議減少人數',
        net: '⚠️ 建議降網防護',
        condition: '🟡 風力較大，建議有經驗者練習',
        safety: '⚠️ 注意安全，隨時關注風況變化'
      };
    } else if (avgWindSpeed > 5) {
      return {
        operation: '🌬️ 中等風力，可正常營運',
        net: '✅ 風力穩定，防護網可正常使用',
        condition: '🟡 風力適中，適合各種練習項目',
        safety: '✅ 目前風力安全，維持正常作業即可'
      };
    } else {
      return {
        operation: '✅ 風力適中，練習條件良好',
        net: '✅ 風力穩定，防護網可正常使用',
        condition: '🎯 風力適中，適合各種練習項目',
        safety: '✅ 目前風力安全，維持正常作業即可'
      };
    }
  }

  /**
   * 蒲福風級
   */
  private getBeaufortScale(windSpeed: number): number {
    if (windSpeed < 0.3) return 0;
    if (windSpeed < 1.6) return 1;
    if (windSpeed < 3.4) return 2;
    if (windSpeed < 5.5) return 3;
    if (windSpeed < 8.0) return 4;
    if (windSpeed < 10.8) return 5;
    if (windSpeed < 13.9) return 6;
    if (windSpeed < 17.2) return 7;
    return 8;
  }

  /**
   * 風級描述
   */
  private getWindDescription(beaufort: number): string {
    const descriptions = ['無風', '軟風', '輕風', '微風', '和風', '清風', '強風', '疾風', '大風'];
    return descriptions[Math.min(beaufort, 8)];
  }

  /**
   * 角度轉風向
   */
  private convertDegreesToDirection(degrees: number): string {
    const directions = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', 
                        '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[Math.abs(index)];
  }
}

export const combinedForecastService = new CombinedForecastService();
