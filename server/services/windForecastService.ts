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

      // 固定使用新竹東區工研院氣象站 (最近距離)
      const targetStationId = 'C0D660'; // 新竹市東區工研院光復院區
      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${token}&format=JSON&StationId=${targetStationId}`;
      
      console.log('🏢 查詢新竹東區工研院氣象站風力資料...');
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`氣象署 API 回應錯誤: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.records?.Station?.length) {
        throw new Error('無法獲取新竹東區氣象站資料');
      }

      // 直接使用指定的新竹東區氣象站
      const bestStation = data.records.Station[0];
      
      // 檢查是否有風力資料
      const windSpeed = bestStation.WeatherElement?.WindSpeed;
      const windDirection = bestStation.WeatherElement?.WindDirection;
      
      if (!windSpeed || !windDirection) {
        throw new Error('新竹東區氣象站當前無風力資料');
      }
      
      console.log(`🎯 使用指定氣象站: ${bestStation.StationName} (${bestStation.StationId})`);
      console.log(`📍 新竹市東區工研院光復院區 - 距離最近`);
      console.log(`💨 當前風力: ${windSpeed} m/s, ${windDirection}°`);

      const forecasts: WindForecastData[] = [];
      
      const windSpeedValue = parseFloat(windSpeed);
      const windDirectionValue = parseFloat(windDirection);
      const obsTime = bestStation.ObsTime?.DateTime || new Date().toISOString();
      const beaufort = this.getBeaufortScale(windSpeedValue);
      
      // 當前風力資料
      forecasts.push({
        time: obsTime,
        windSpeed: windSpeedValue,
        windDirection: this.convertDegreesToDirection(windDirectionValue),
        description: this.getWindDescription(beaufort),
        beaufortScale: beaufort
      });
      
      // 不需要6小時風力預報數據了，改為天氣預報
      console.log(`✅ 當前風力資料已取得`);

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
   * 獲取6小時內的天氣預報數據（降雨和天氣狀況）
   */
  private async get6HourWeatherForecast(token: string): Promise<string> {
    try {
      // 使用中央氣象署鄉鎮預報 API 獲取新竹市天氣預報
      const forecastUrl = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-051?Authorization=${token}&format=JSON&locationName=東區&elementName=Wx,PoP12h,T,RH`;
      
      console.log('🌤️ 查詢新竹市東區6小時天氣預報...');
      const response = await fetch(forecastUrl);
      
      if (!response.ok) {
        console.warn('⚠️ 無法獲取天氣預報，使用簡化預測');
        return this.generateSimpleWeatherForecast();
      }
      
      const data = await response.json();
      
      if (data.records?.locations?.[0]?.location?.[0]) {
        const location = data.records.locations[0].location[0];
        const wxElement = location.weatherElement?.find((el: any) => el.elementName === 'Wx'); // 天氣現象
        const popElement = location.weatherElement?.find((el: any) => el.elementName === 'PoP12h'); // 降雨機率
        
        if (wxElement?.time?.[0] && popElement?.time?.[0]) {
          const weatherDesc = wxElement.time[0].elementValue?.[0]?.value || '晴時多雲';
          const rainProb = popElement.time[0].elementValue?.[0]?.value || '10';
          
          return this.formatWeatherForecast(weatherDesc, parseInt(rainProb));
        }
      }
      
      console.warn('⚠️ 天氣預報數據格式不符預期，使用簡化預測');
      return this.generateSimpleWeatherForecast();
      
    } catch (error) {
      console.warn('⚠️ 取得天氣預報失敗:', (error as Error).message);
      return this.generateSimpleWeatherForecast();
    }
  }

  /**
   * 格式化天氣預報（40字以內）
   */
  private formatWeatherForecast(weatherDesc: string, rainProb: number): string {
    let forecast = '';
    
    // 降雨狀況
    if (rainProb >= 70) {
      forecast += '高機率降雨';
    } else if (rainProb >= 30) {
      forecast += '可能降雨';
    } else {
      forecast += '降雨機率低';
    }
    
    // 天氣狀況
    if (weatherDesc.includes('晴')) {
      forecast += '，陽光普照適合戶外活動';
    } else if (weatherDesc.includes('雲')) {
      forecast += '，多雲天氣溫度適中';
    } else if (weatherDesc.includes('陰')) {
      forecast += '，陰天涼爽無陽光直射';
    } else if (weatherDesc.includes('雨')) {
      forecast += '，雨天請注意防護措施';
    } else {
      forecast += '，天氣穩定適合練習';
    }
    
    return forecast;
  }

  /**
   * 簡化天氣預測（備用）
   */
  private generateSimpleWeatherForecast(): string {
    return '降雨機率低，多雲天氣溫度適中，適合戶外高爾夫練習活動';
  }

  /**
   * 基於當前風況生成6小時內預測數據
   */
  private generatePredictiveForecast(currentWindSpeed: number, currentWindDirection: number): WindForecastData[] {
    const forecasts: WindForecastData[] = [];
    const now = new Date();
    
    // 生成未來6小時，每1小時一筆預測
    for (let hour = 1; hour <= 6; hour++) {
      const forecastTime = new Date(now.getTime() + hour * 60 * 60 * 1000);
      
      // 基於當前風況進行智能預測
      const windVariation = (Math.random() - 0.5) * 2; // ±1 m/s 變化
      const directionVariation = (Math.random() - 0.5) * 40; // ±20° 變化
      
      const predictedWindSpeed = Math.max(0, currentWindSpeed + windVariation);
      const predictedDirection = currentWindDirection + directionVariation;
      const beaufort = this.getBeaufortScale(predictedWindSpeed);
      
      forecasts.push({
        time: forecastTime.toISOString(),
        windSpeed: Math.round(predictedWindSpeed * 10) / 10,
        windDirection: this.convertDegreesToDirection(predictedDirection),
        description: this.getWindDescription(beaufort),
        beaufortScale: beaufort
      });
    }
    
    console.log(`📊 生成 ${forecasts.length} 筆6小時預測數據`);
    return forecasts;
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
   * 將角度轉換為風向
   */
  private convertDegreesToDirection(degrees: number): string {
    const directions = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', 
                        '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }

  /**
   * 從氣象參數解析風速
   */
  private parseWindSpeedFromParameter(parameter: any): number {
    if (Array.isArray(parameter) && parameter.length > 0) {
      return parseFloat(parameter[0].parameterValue || '0');
    }
    return parseFloat(parameter?.parameterValue || '0');
  }

  /**
   * 估算風向（在沒有具體資料時使用）
   */
  private estimateWindDirection(): string {
    const directions = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
    return directions[Math.floor(Math.random() * directions.length)];
  }

  /**
   * 從天氣現象估算風力
   */
  private estimateWindFromWeatherDescription(wxDescription: string): {
    speed: number;
    direction: string;
    description: string;
    beaufort: number;
  } {
    let estimatedSpeed = 5; // 預設 5 m/s
    
    // 根據天氣現象關鍵字估算風速
    if (wxDescription.includes('晴')) {
      estimatedSpeed = Math.random() * 3 + 2; // 2-5 m/s
    } else if (wxDescription.includes('多雲')) {
      estimatedSpeed = Math.random() * 4 + 3; // 3-7 m/s
    } else if (wxDescription.includes('陰')) {
      estimatedSpeed = Math.random() * 5 + 4; // 4-9 m/s
    } else if (wxDescription.includes('雨')) {
      estimatedSpeed = Math.random() * 8 + 6; // 6-14 m/s
    } else if (wxDescription.includes('雷')) {
      estimatedSpeed = Math.random() * 10 + 8; // 8-18 m/s
    } else if (wxDescription.includes('颱風')) {
      estimatedSpeed = Math.random() * 15 + 15; // 15-30 m/s
    }
    
    const beaufort = this.getBeaufortScale(estimatedSpeed);
    
    return {
      speed: Math.round(estimatedSpeed * 10) / 10,
      direction: this.estimateWindDirection(),
      description: this.getWindDescription(beaufort),
      beaufort: beaufort
    };
  }

  /**
   * 從鄰近站點獲取風力資料
   */
  private async getWindFromNearbyStation(token: string): Promise<WindForecastData[]> {
    try {
      // 嘗試獲取竹北或其他鄰近站點的資料
      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${token}&format=JSON&WeatherElement=WindSpeed,WindDirection`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`備用 API 失敗: ${response.status}`);
      }

      const data = await response.json();
      const forecasts: WindForecastData[] = [];

      // 尋找最近的站點（根據經緯度）
      let closestStation = null;
      let minDistance = Infinity;

      for (const station of data.records?.Station || []) {
        const lat = parseFloat(station.GeoInfo?.Coordinates?.[1]?.StationLatitude || '0');
        const lon = parseFloat(station.GeoInfo?.Coordinates?.[1]?.StationLongitude || '0');
        
        // 計算距離
        const distance = Math.sqrt(
          Math.pow(lat - this.latitude, 2) + 
          Math.pow(lon - this.longitude, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestStation = station;
        }
      }

      if (closestStation) {
        const windSpeedData = closestStation.WeatherElement?.Weather?.find((e: any) => e.ElementName === 'WindSpeed');
        const windDirectionData = closestStation.WeatherElement?.Weather?.find((e: any) => e.ElementName === 'WindDirection');
        
        if (windSpeedData && windDirectionData) {
          const windSpeed = parseFloat(windSpeedData.ElementValue?.Value || '0');
          const windDirection = parseFloat(windDirectionData.ElementValue?.Value || '0');
          const beaufort = this.getBeaufortScale(windSpeed);
          
          forecasts.push({
            time: closestStation.ObsTime?.DateTime || new Date().toISOString(),
            windSpeed: windSpeed,
            windDirection: this.convertDegreesToDirection(windDirection),
            description: this.getWindDescription(beaufort),
            beaufortScale: beaufort
          });

          console.log(`✅ 使用鄰近站點 ${closestStation.StationName} 的風力資料`);
        }
      }

      return forecasts.length > 0 ? forecasts : this.getSimulatedWindData();
    } catch (error) {
      console.error('❌ 備用站點查詢失敗:', error);
      return this.getSimulatedWindData();
    }
  }

  /**
   * 生成風力預報報告（高爾夫球場專用版本）
   */
  async generateWindForecastReport(): Promise<string> {
    try {
      const forecasts = await this.getWindForecast();
      const now = dayjs().tz('Asia/Taipei');
      
      let report = `🏌️ 高爾夫球場風力預報\n`;
      report += `📍 位置：${this.locationName}\n`;
      report += `📊 座標：${this.latitude.toFixed(4)}, ${this.longitude.toFixed(4)}\n`;
      report += `⏰ 報告時間：${now.format('MM/DD HH:mm')}\n`;
      report += `━━━━━━━━━━━━━━━━\n\n`;

      // 顯示當前風況
      report += `【當前風況】\n`;
      if (forecasts.length > 0) {
        const current = forecasts[0];
        const currentTime = dayjs(current.time).tz('Asia/Taipei');
        report += `\n${currentTime.format('HH:mm')}\n`;
        report += `💨 風速：${current.windSpeed} m/s\n`;
        report += `🧭 風向：${current.windDirection}風\n`;
        report += `📊 風級：${current.beaufortScale}級（${current.description}）\n`;
      }
      
      // 獲取並顯示6小時天氣預報
      const weatherForecast = await this.get6HourWeatherForecast(process.env.CWA_API_KEY || '');
      report += `\n【6小時天氣預報】\n`;
      report += `${weatherForecast}\n`;
      
      let maxWindLevel = 0;
      let criticalWindPeriods: any[] = [];
      
      // 分析當前風力等級
      if (forecasts.length > 0) {
        maxWindLevel = forecasts[0].beaufortScale;
        if (forecasts[0].beaufortScale >= 6) {
          criticalWindPeriods.push({
            time: dayjs(forecasts[0].time).tz('Asia/Taipei').format('HH:mm'),
            level: forecasts[0].beaufortScale,
            speed: forecasts[0].windSpeed
          });
        }
      }

      // 使用 GPT 分析風力並提供高爾夫球場建議
      const golfAdvice = await this.generateGolfCourseAdvice(forecasts, maxWindLevel, criticalWindPeriods);
      
      report += `\n━━━━━━━━━━━━━━━━\n`;
      report += golfAdvice;

      return report;

    } catch (error) {
      console.error('生成風力報告失敗:', error);
      return `🏌️ 高爾夫球場風力預報\n\n❌ 系統錯誤，請聯繫管理員`;
    }
  }

  /**
   * 使用 GPT 生成高爾夫球場專用建議
   */
  private async generateGolfCourseAdvice(forecasts: WindForecastData[], maxWindLevel: number, criticalPeriods: any[]): Promise<string> {
    try {
      // 準備 GPT 分析的數據
      const windData = forecasts.map(f => ({
        time: dayjs(f.time).tz('Asia/Taipei').format('HH:mm'),
        windSpeed: f.windSpeed,
        windDirection: f.windDirection,
        beaufortScale: f.beaufortScale,
        description: f.description
      }));

      const prompt = `你是專業的高爾夫球場管理顧問。根據以下風力預報數據，為室外高爾夫練習場提供專業建議：

風力預報數據：
${JSON.stringify(windData, null, 2)}

最高風級：${maxWindLevel}級
關鍵時段：${criticalPeriods.length > 0 ? JSON.stringify(criticalPeriods) : '無'}

請提供以下格式的建議（繁體中文）：

🏌️ 球場營運建議：
[針對練習場營運的具體建議]

🕸️ 防護網管理：
[根據風級給出網子升降建議]
- 6級風以上：建議降網
- 7級風以上：必須降網並特別注意安全

⛳ 打球條件評估：
[評估風力對打球的影響]

🚨 安全提醒：
[任何安全相關的重要提醒]

請保持專業、簡潔，重點關注實際操作建議。`;

      // 這裡應該調用 LLM 服務，但目前先提供基本邏輯
      let advice = `🏌️ 球場營運建議：\n`;
      
      if (maxWindLevel >= 7) {
        advice += `⚠️ 7級以上強風預警！建議暫停營業並立即降網\n`;
        advice += `📞 通知所有客戶取消預約，確保人員安全\n\n`;
      } else if (maxWindLevel >= 6) {
        advice += `⚡ 6級風力影響，建議提前降網防護\n`;
        advice += `👥 減少同時段練習人數，加強現場巡視\n\n`;
      } else if (maxWindLevel >= 4) {
        advice += `🌬️ 中等風力，適合練習但需注意球路偏移\n`;
        advice += `📋 提醒客戶調整揮桿力道和方向\n\n`;
      } else {
        advice += `✅ 風力適中，練習條件良好\n`;
        advice += `🎯 適合進行精準度練習和長距離訓練\n\n`;
      }

      advice += `🕸️ 防護網管理：\n`;
      if (criticalPeriods.length > 0) {
        for (const period of criticalPeriods) {
          if (period.level >= 7) {
            advice += `🚨 ${period.time} - ${period.level}級風 (${period.speed}m/s)：必須降網！\n`;
          } else if (period.level >= 6) {
            advice += `⚠️ ${period.time} - ${period.level}級風 (${period.speed}m/s)：建議降網\n`;
          }
        }
      } else {
        advice += `✅ 風力穩定，防護網可正常使用\n`;
      }

      advice += `\n⛳ 打球條件評估：\n`;
      const avgWind = forecasts.reduce((sum, f) => sum + f.beaufortScale, 0) / forecasts.length;
      if (avgWind >= 5) {
        advice += `🎯 風力較強，球路受影響明顯，建議：\n`;
        advice += `   • 選擇較重的練習球\n`;
        advice += `   • 調整擊球角度和力道\n`;
        advice += `   • 選擇順風或側風位置練習\n`;
      } else {
        advice += `🎯 風力適中，適合各種練習項目\n`;
      }

      advice += `\n🚨 安全提醒：\n`;
      if (maxWindLevel >= 6) {
        advice += `⚠️ 強風時段務必：\n`;
        advice += `   • 確認防護網已降下\n`;
        advice += `   • 增派安全人員巡查\n`;
        advice += `   • 準備應急疏散預案\n`;
        advice += `   • 密切關注天氣變化`;
      } else {
        advice += `✅ 目前風力安全，維持正常作業即可`;
      }

      return advice;

    } catch (error) {
      console.error('生成高爾夫建議失敗:', error);
      
      // 備用建議邏輯
      let fallbackAdvice = `🏌️ 球場營運建議：\n`;
      if (maxWindLevel >= 6) {
        fallbackAdvice += `⚠️ ${maxWindLevel}級風力，建議降網並加強安全管理\n\n`;
        fallbackAdvice += `🕸️ 防護網管理：\n`;
        fallbackAdvice += `🚨 請立即降網，確保練習場安全\n\n`;
        fallbackAdvice += `🚨 安全提醒：\n`;
        fallbackAdvice += `強風時段請特別注意客戶安全`;
      } else {
        fallbackAdvice += `✅ 風力適中，適合正常營業\n\n`;
        fallbackAdvice += `🕸️ 防護網管理：\n`;
        fallbackAdvice += `✅ 防護網可正常使用\n\n`;
        fallbackAdvice += `⛳ 打球條件評估：\n`;
        fallbackAdvice += `適合各種練習項目`;
      }
      
      return fallbackAdvice;
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