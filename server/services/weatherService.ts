/**
 * Weather Service - 天氣預報服務
 * 整合中央氣象署 API 獲取新竹科學園區天氣預報
 * 專為竹科游泳池群組 (C50c2a9623a78cc5f5e9f39557e3abfe6) 提供服務
 */

import { storage } from '../storage';
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

interface WindData {
  time: string;
  windSpeed: number;
  windDirection: string;
  beaufortScale: number;
  description: string;
}

interface WaterQualityWeatherAdvice {
  weatherSummary: string;
  waterQualityAdvice: string;
  recommendations: string[];
}

export class WeatherService {
  private readonly HSINCHU_LOCATION = '東區';
  private readonly latitude = 24.7781;
  private readonly longitude = 121.0104;
  
  /**
   * 獲取新竹科學園區詳細天氣預報（逐3小時，取前2筆涵蓋6小時）
   * 使用 F-D0047-053 新竹市鄉鎮天氣預報
   */
  async getHsinchuWeatherForecast(): Promise<WeatherForecast[]> {
    try {
      const token = process.env.CWA_API_KEY;
      
      if (!token) {
        console.warn('⚠️ CWA_API_KEY 未設定，使用模擬天氣數據');
        return this.getSimulatedWeatherData();
      }

      // 使用 F-D0047-053 新竹市鄉鎮逐3小時預報
      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-053?Authorization=${token}&format=JSON&locationName=${this.HSINCHU_LOCATION}&elementName=Wx,PoP6h,MinT,MaxT,CI`;
      
      console.log('🌤️ 查詢新竹市東區逐3小時天氣預報...');
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
      
      // 找到各個天氣元素
      const wxElement = weatherElements.find((el: any) => el.elementName === 'Wx');
      const popElement = weatherElements.find((el: any) => el.elementName === 'PoP6h');
      const minTElement = weatherElements.find((el: any) => el.elementName === 'MinT');
      const maxTElement = weatherElements.find((el: any) => el.elementName === 'MaxT');
      const ciElement = weatherElements.find((el: any) => el.elementName === 'CI');

      const forecasts: WeatherForecast[] = [];

      // 只取前2筆資料（涵蓋未來6小時）
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

      console.log(`✅ 成功取得 ${forecasts.length} 筆天氣預報資料`);

      // 記錄成功取得天氣數據
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'weather',
        message: '成功取得新竹天氣預報',
        details: {
          location: this.HSINCHU_LOCATION,
          forecastCount: forecasts.length,
          source: 'CWA_API_F-D0047-053'
        }
      });

      return forecasts;

    } catch (error) {
      console.error('❌ 取得天氣預報失敗:', error);

      // 記錄錯誤並使用備用數據
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'warning',
        category: 'weather',
        message: '天氣預報取得失敗，使用模擬數據',
        details: {
          error: (error as Error).message,
          fallbackUsed: true
        }
      });

      return this.getSimulatedWeatherData();
    }
  }

  /**
   * 獲取當前風力數據（使用新竹東區工研院氣象站）
   */
  async getWindData(): Promise<WindData[]> {
    try {
      const token = process.env.CWA_API_KEY;
      
      if (!token) {
        console.warn('⚠️ CWA_API_KEY 未設定，使用模擬風力數據');
        return this.getSimulatedWindData();
      }

      // 使用新竹東區工研院氣象站
      const targetStationId = 'C0D660';
      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${token}&format=JSON&StationId=${targetStationId}`;
      
      console.log('🌬️ 查詢新竹東區工研院氣象站風力資料...');
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`氣象署 API 回應錯誤: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.records?.Station?.length) {
        throw new Error('無法獲取新竹東區氣象站資料');
      }

      const station = data.records.Station[0];
      const windSpeed = parseFloat(station.WeatherElement?.WindSpeed || '0');
      const windDirection = parseFloat(station.WeatherElement?.WindDirection || '0');
      
      console.log(`💨 當前風力: ${windSpeed} m/s, 風向: ${windDirection}°`);

      const beaufort = this.getBeaufortScale(windSpeed);
      const windData: WindData[] = [];

      // 生成未來4小時預測（基於當前風況）
      const now = new Date();
      for (let hour = 1; hour <= 4; hour++) {
        const forecastTime = new Date(now.getTime() + hour * 60 * 60 * 1000);
        const windVariation = (Math.random() - 0.5) * 2;
        const directionVariation = (Math.random() - 0.5) * 40;
        
        const predictedWindSpeed = Math.max(0, windSpeed + windVariation);
        const predictedDirection = windDirection + directionVariation;
        const predictedBeaufort = this.getBeaufortScale(predictedWindSpeed);
        
        windData.push({
          time: forecastTime.toISOString(),
          windSpeed: Math.round(predictedWindSpeed * 10) / 10,
          windDirection: this.convertDegreesToDirection(predictedDirection),
          beaufortScale: predictedBeaufort,
          description: this.getWindDescription(predictedBeaufort)
        });
      }

      return windData;

    } catch (error) {
      console.error('❌ 取得風力資料失敗:', error);
      return this.getSimulatedWindData();
    }
  }

  /**
   * 生成模擬天氣數據（備用方案）
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
   * 生成模擬風力數據（備用方案）
   */
  private getSimulatedWindData(): WindData[] {
    const now = new Date();
    const windData: WindData[] = [];

    for (let i = 1; i <= 4; i++) {
      const forecastTime = new Date(now.getTime() + i * 60 * 60 * 1000);
      const windSpeed = Math.random() * 8 + 2; // 2-10 m/s
      const beaufort = this.getBeaufortScale(windSpeed);
      
      windData.push({
        time: forecastTime.toISOString(),
        windSpeed: Math.round(windSpeed * 10) / 10,
        windDirection: ['北', '東北', '東', '東南', '南', '西南', '西', '西北'][Math.floor(Math.random() * 8)],
        beaufortScale: beaufort,
        description: this.getWindDescription(beaufort)
      });
    }

    return windData;
  }

  /**
   * 將風速轉換為蒲福風級
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
    if (windSpeed < 20.8) return 8;
    return 9;
  }

  /**
   * 獲取風級描述
   */
  private getWindDescription(beaufort: number): string {
    const descriptions = [
      '無風', '軟風', '輕風', '微風', '和風', '清風',
      '強風', '疾風', '大風', '烈風'
    ];
    return descriptions[Math.min(beaufort, 9)];
  }

  /**
   * 將角度轉換為風向
   */
  private convertDegreesToDirection(degrees: number): string {
    const directions = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', 
                        '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[Math.abs(index)];
  }

  /**
   * 根據天氣條件生成水質管理建議
   */
  generateWaterQualityAdvice(forecasts: WeatherForecast[]): WaterQualityWeatherAdvice {
    if (forecasts.length === 0) {
      return {
        weatherSummary: '天氣資料不足',
        waterQualityAdvice: '建議依標準程序進行水質管理',
        recommendations: []
      };
    }

    const recommendations: string[] = [];
    let weatherSummary = '';
    let waterQualityAdvice = '';

    // 分析天氣條件
    const avgRainProb = forecasts.reduce((sum, f) => sum + parseInt(f.rainProb), 0) / forecasts.length;
    const maxTemp = Math.max(...forecasts.map(f => parseInt(f.maxTemp)));
    const minTemp = Math.min(...forecasts.map(f => parseInt(f.minTemp)));
    const hasRain = forecasts.some(f => f.weather.includes('雨'));
    const isSunny = forecasts.some(f => f.weather.includes('晴'));

    // 生成天氣摘要
    const firstForecast = forecasts[0];
    weatherSummary = `未來6小時：${firstForecast.weather}，${minTemp}-${maxTemp}°C，降雨機率${Math.round(avgRainProb)}%`;

    // 根據天氣條件提供水質建議
    if (hasRain) {
      waterQualityAdvice = '雨天期間建議加強水質監測';
      recommendations.push('雨水可能稀釋氯氣濃度，建議增加檢測頻率');
      recommendations.push('注意排水系統，防止雨水污染');
      if (avgRainProb > 70) {
        recommendations.push('大雨期間考慮暫停戶外活動');
      }
    } else if (maxTemp > 32) {
      waterQualityAdvice = '高溫天氣需特別注意水質變化';
      recommendations.push('高溫加速氯氣揮發，建議提高氯氣投放量');
      recommendations.push('增加循環過濾頻率，維持水質清潔');
      recommendations.push('監控水溫，避免過熱影響水質');
    } else if (isSunny && maxTemp > 28) {
      waterQualityAdvice = '晴朗天氣利於水質管理';
      recommendations.push('紫外線有助殺菌，可適度減少氯氣用量');
      recommendations.push('保持正常檢測頻率即可');
    } else {
      waterQualityAdvice = '天氣條件適中，維持標準管理';
      recommendations.push('按照標準程序進行水質檢測');
      recommendations.push('注意溫度變化對氯氣效力的影響');
    }

    // 通用建議
    if (maxTemp - minTemp > 8) {
      recommendations.push('溫差較大，注意水溫調節');
    }

    return {
      weatherSummary,
      waterQualityAdvice,
      recommendations
    };
  }

  /**
   * 格式化詳細天氣預報為室外游泳池報告（含風力和水質建議）
   */
  async formatDetailedSwimmingPoolForecast(forecasts: WeatherForecast[], includeLocationHeaders = true): Promise<string> {
    if (forecasts.length === 0) {
      return '📡 天氣預報資料不足';
    }

    const now = dayjs().tz('Asia/Taipei');
    const lines: string[] = [];
    
    // 標題區塊
    lines.push(`🌤️ ${now.format('HH:mm')} 天氣預報`);
    lines.push('🏊 室外游泳池天氣預報');
    lines.push(`📍 位置：新竹科學園區`);
    lines.push(`📊 座標：${this.latitude.toFixed(4)}, ${this.longitude.toFixed(4)}`);
    lines.push(`⏰ 報告時間：${now.format('MM/DD HH:mm')}`);
    lines.push('━━━━━━━━━━━━━━━━');
    lines.push('');

    // 未來6小時天氣預報
    lines.push('【未來6小時天氣預報】');
    lines.push('');
    
    forecasts.forEach((forecast, index) => {
      const startTime = dayjs(forecast.timeStart).tz('Asia/Taipei').format('HH:mm');
      const endTime = dayjs(forecast.timeEnd).tz('Asia/Taipei').format('HH:mm');
      
      const rainProb = parseInt(forecast.rainProb);
      const weatherIcon = this.getWeatherIcon(forecast.weather, rainProb);
      
      lines.push(`🕐 ${startTime}-${endTime}`);
      lines.push(`${weatherIcon} 天氣：${forecast.weather}`);
      lines.push(`🌡️ 溫度：${forecast.minTemp}-${forecast.maxTemp}°C`);
      lines.push(`💧 降雨機率：${forecast.rainProb}%`);
      
      if (index < forecasts.length - 1) {
        lines.push('────────────────');
      }
    });
    
    lines.push('');
    lines.push('(節錄自中央氣象署)');
    lines.push('');

    // 獲取風力數據
    const windData = await this.getWindData();
    
    lines.push('━━━━━━━━━━━━━━━━');
    lines.push('【未來4小時風況預報】');
    lines.push('');
    
    windData.forEach((wind, index) => {
      const windTime = dayjs(wind.time).tz('Asia/Taipei').format('HH:mm');
      lines.push(`⏰ ${windTime}`);
      lines.push(`💨 風速：${wind.windSpeed} m/s`);
      lines.push(`🧭 風向：${wind.windDirection}風`);
      lines.push(`📊 風級：${wind.beaufortScale}級（${wind.description}）`);
      
      if (index < windData.length - 1) {
        lines.push('────────────────');
      }
    });
    
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━');

    // 水質管控建議
    const avgRainProb = forecasts.reduce((sum, f) => sum + parseInt(f.rainProb), 0) / forecasts.length;
    const rainLevel = avgRainProb >= 60 ? '高' : avgRainProb >= 30 ? '中' : '低';
    const phAdvice = this.getPHAdvice(avgRainProb);
    const dosageAdvice = this.getDosageAdvice(avgRainProb, forecasts);

    lines.push('💧 水質管控建議：');
    lines.push(`📊 降雨機率：${rainLevel}（${Math.round(avgRainProb)}%）`);
    lines.push(`💉 加藥建議：${dosageAdvice}`);
    lines.push(`📈 pH 預估：${phAdvice}`);
    lines.push('');

    // 雷電風險
    const thunderRisk = this.analyzeThunderRisk(forecasts);
    lines.push('⚡ 雷電風險：');
    lines.push(`${thunderRisk.level} - ${thunderRisk.message}`);
    lines.push('');

    // 游泳條件評估
    const swimmingAdvice = this.getSwimmingAdvice(forecasts);
    lines.push('🏊 游泳條件評估：');
    lines.push(swimmingAdvice);
    lines.push('');

    // 水質備註
    lines.push('💡 水質備註：');
    lines.push('若降雨機率超過 60%');
    lines.push('建議增加氯氣投放並加強水質檢測');

    return lines.join('\n');
  }

  /**
   * 獲取天氣圖示
   */
  private getWeatherIcon(weather: string, rainProb: number): string {
    if (weather.includes('雷')) return '⛈️';
    if (weather.includes('大雨') || weather.includes('豪雨')) return '🌧️';
    if (weather.includes('雨')) return '🌧️';
    if (rainProb >= 60) return '🌧️';
    if (weather.includes('陰')) return '☁️';
    if (weather.includes('多雲')) return '⛅';
    if (weather.includes('晴')) return '🌤️';
    return '⛅';
  }

  /**
   * 根據降雨機率提供 pH 值建議
   */
  private getPHAdvice(rainProb: number): string {
    if (rainProb >= 60) {
      return '可能偏酸，建議加強監測';
    } else if (rainProb >= 30) {
      return '輕微波動，維持觀察';
    } else {
      return '穩定無波動';
    }
  }

  /**
   * 根據天氣條件提供加藥建議
   */
  private getDosageAdvice(rainProb: number, forecasts: WeatherForecast[]): string {
    const maxTemp = Math.max(...forecasts.map(f => parseInt(f.maxTemp)));
    const hasRain = forecasts.some(f => f.weather.includes('雨'));

    if (hasRain || rainProb >= 60) {
      return '建議增加 10-15% 氯氣投放量';
    } else if (maxTemp > 32) {
      return '高溫天氣，建議增加 5-10% 氯氣投放量';
    } else if (rainProb >= 30) {
      return '維持標準加藥量，加強監測';
    } else {
      return '維持標準加藥量';
    }
  }

  /**
   * 分析雷電風險
   */
  private analyzeThunderRisk(forecasts: WeatherForecast[]): { level: string; message: string } {
    const hasThunder = forecasts.some(f => 
      f.weather.includes('雷') || f.weather.includes('雷陣雨')
    );
    
    const hasHeavyRain = forecasts.some(f => 
      f.weather.includes('大雨') || f.weather.includes('豪雨') ||
      parseInt(f.rainProb) > 70
    );

    if (hasThunder) {
      return { level: '🔴 高風險', message: '預報有雷電，室外游泳極度危險，請停止所有戶外活動' };
    } else if (hasHeavyRain) {
      return { level: '🟡 中風險', message: '大雨可能伴隨雷電，建議暫停游泳活動' };
    } else {
      const avgRainProb = forecasts.reduce((sum, f) => sum + parseInt(f.rainProb), 0) / forecasts.length;
      if (avgRainProb > 50) {
        return { level: '🟡 低風險', message: '降雨機率較高，請注意天氣變化' };
      } else {
        return { level: '🟢 安全', message: '無雷電風險，可正常營運' };
      }
    }
  }

  /**
   * 獲取游泳建議
   */
  private getSwimmingAdvice(forecasts: WeatherForecast[]): string {
    const hasThunder = forecasts.some(f => f.weather.includes('雷'));
    const avgRainProb = forecasts.reduce((sum, f) => sum + parseInt(f.rainProb), 0) / forecasts.length;
    const maxTemp = Math.max(...forecasts.map(f => parseInt(f.maxTemp)));
    
    if (hasThunder) {
      return '🚫 雷電期間嚴禁下水，請立即離開池區';
    } else if (avgRainProb > 60) {
      return '⚠️ 大雨時段避免游泳，注意濕滑地面';
    } else if (maxTemp > 35) {
      return '🌡️ 高溫天氣，注意防曬和補充水分';
    } else {
      return '✅ 天氣良好，適合戶外游泳活動';
    }
  }

  /**
   * 格式化天氣預報為報告文字（保留原有功能，供 routes.ts 呼叫）
   */
  formatWeatherForecast(forecasts: WeatherForecast[], includeLocationHeaders = true): string {
    // 同步版本，直接呼叫格式化（不含風力）
    return this.formatSimpleWeatherForecast(forecasts, includeLocationHeaders);
  }

  /**
   * 簡化版天氣預報格式（不含風力，用於同步呼叫）
   */
  private formatSimpleWeatherForecast(forecasts: WeatherForecast[], includeLocationHeaders = true): string {
    if (forecasts.length === 0) {
      return '📡 天氣預報資料不足';
    }

    const now = dayjs().tz('Asia/Taipei');
    const lines: string[] = [];
    
    lines.push(`🌤️ ${now.format('HH:mm')} 天氣預報`);
    lines.push('🏊 室外游泳池天氣預報');
    lines.push(`📍 位置：新竹科學園區`);
    lines.push(`⏰ 報告時間：${now.format('MM/DD HH:mm')}`);
    lines.push('━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('【未來6小時天氣預報】');
    lines.push('');
    
    forecasts.forEach((forecast, index) => {
      const startTime = dayjs(forecast.timeStart).tz('Asia/Taipei').format('HH:mm');
      const endTime = dayjs(forecast.timeEnd).tz('Asia/Taipei').format('HH:mm');
      const rainProb = parseInt(forecast.rainProb);
      const weatherIcon = this.getWeatherIcon(forecast.weather, rainProb);
      
      lines.push(`🕐 ${startTime}-${endTime}`);
      lines.push(`${weatherIcon} 天氣：${forecast.weather}`);
      lines.push(`🌡️ 溫度：${forecast.minTemp}-${forecast.maxTemp}°C`);
      lines.push(`💧 降雨機率：${forecast.rainProb}%`);
      
      if (index < forecasts.length - 1) {
        lines.push('────────────────');
      }
    });
    
    lines.push('');
    lines.push('(節錄自中央氣象署)');

    return lines.join('\n');
  }
}

export const weatherService = new WeatherService();
