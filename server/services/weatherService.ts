/**
 * Weather Service - 天氣預報服務
 * 整合中央氣象署 API 獲取新竹科學園區天氣預報
 */

import { storage } from '../storage';
import crypto from 'crypto';

interface WeatherForecast {
  timeStart: string;
  timeEnd: string;
  weather: string;
  rainProb: string;
  minTemp: string;
  maxTemp: string;
  comfort: string;
}

interface WaterQualityWeatherAdvice {
  weatherSummary: string;
  waterQualityAdvice: string;
  recommendations: string[];
}

export class WeatherService {
  private readonly HSINCHU_LOCATION = '新竹市';
  
  /**
   * 獲取新竹科學園區詳細天氣預報（12小時）
   */
  async getHsinchuWeatherForecast(): Promise<WeatherForecast[]> {
    try {
      // 使用中央氣象署 API
      const token = process.env.CWA_API_KEY;
      
      if (!token) {
        console.warn('⚠️ CWA_API_KEY 未設定，使用模擬天氣數據');
        return this.getSimulatedWeatherData();
      }

      const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${token}&format=JSON&locationName=${this.HSINCHU_LOCATION}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`氣象署 API 回應錯誤: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.records?.location?.[0]?.weatherElement) {
        throw new Error('氣象署 API 數據格式錯誤');
      }

      const weatherData = data.records.location[0].weatherElement;
      const forecasts: WeatherForecast[] = [];

      // 解析未來 12 小時的天氣預報（前四個時段）
      for (let i = 0; i < 4; i++) {
        if (weatherData[0].time[i]) {
          forecasts.push({
            timeStart: weatherData[0].time[i].startTime,
            timeEnd: weatherData[0].time[i].endTime,
            weather: weatherData[0].time[i].parameter.parameterName, // Wx 天氣現象
            rainProb: weatherData[1].time[i].parameter.parameterName, // PoP 降雨機率
            minTemp: weatherData[2].time[i].parameter.parameterName,   // MinT 最低溫度
            maxTemp: weatherData[4].time[i].parameter.parameterName,   // MaxT 最高溫度
            comfort: weatherData[3].time[i].parameter.parameterName    // CI 舒適度
          });
        }
      }

      // 記錄成功取得天氣數據
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'weather',
        message: '成功取得新竹天氣預報',
        details: {
          location: this.HSINCHU_LOCATION,
          forecastCount: forecasts.length,
          source: 'CWA_API'
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
   * 生成模擬天氣數據（備用方案）
   */
  private getSimulatedWeatherData(): WeatherForecast[] {
    const now = new Date();
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const twelveHoursLater = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    return [
      {
        timeStart: now.toISOString(),
        timeEnd: sixHoursLater.toISOString(),
        weather: '多雲時晴',
        rainProb: '20',
        minTemp: '26',
        maxTemp: '32',
        comfort: '舒適'
      },
      {
        timeStart: sixHoursLater.toISOString(),
        timeEnd: twelveHoursLater.toISOString(),
        weather: '晴時多雲',
        rainProb: '10',
        minTemp: '24',
        maxTemp: '30',
        comfort: '舒適'
      }
    ];
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
   * 格式化詳細天氣預報為室外游泳池報告
   */
  formatDetailedSwimmingPoolForecast(forecasts: WeatherForecast[]): string {
    if (forecasts.length === 0) {
      return '📡 天氣預報資料不足';
    }

    const lines = ['🏊‍♂️ 室外游泳池天氣預報 (12小時)'];
    lines.push(`📍 新竹科學園區 (24.778, 121.010)`);
    lines.push('');

    // 分析雷電風險
    const thunderRisk = this.analyzeThunderRisk(forecasts);
    const safeTimeSlots = this.findSafeTimeSlots(forecasts);
    
    lines.push('⚡ 雷電風險分析:');
    lines.push(`   ${thunderRisk.level} - ${thunderRisk.message}`);
    lines.push('');

    // 詳細時段預報
    lines.push('📅 詳細時段預報:');
    forecasts.forEach((forecast, index) => {
      const startTime = new Date(forecast.timeStart).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      const endTime = new Date(forecast.timeEnd).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour: '2-digit',
        minute: '2-digit'
      });

      const rainProb = parseInt(forecast.rainProb);
      const rainIcon = rainProb < 30 ? '☀️' : rainProb < 60 ? '⛅' : '🌧️';
      const safetyIcon = this.getSwimmingSafetyIcon(forecast);
      
      lines.push(`${rainIcon} ${startTime}-${endTime}`);
      lines.push(`   天氣: ${forecast.weather}`);
      lines.push(`   溫度: ${forecast.minTemp}-${forecast.maxTemp}°C`);
      lines.push(`   降雨: ${forecast.rainProb}% ${safetyIcon}`);
      lines.push('');
    });

    // 安全建議
    lines.push('🏊‍♂️ 游泳安全建議:');
    if (safeTimeSlots.length > 0) {
      lines.push(`✅ 建議游泳時段: ${safeTimeSlots.join(', ')}`);
    } else {
      lines.push('⚠️ 今日無完全安全時段，請謹慎評估');
    }
    
    lines.push(this.getSwimmingAdvice(forecasts));

    return lines.join('\n');
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
        return { level: '🟢 安全', message: '無明顯雷電風險，可正常游泳' };
      }
    }
  }

  /**
   * 找出安全游泳時段
   */
  private findSafeTimeSlots(forecasts: WeatherForecast[]): string[] {
    const safeSlots: string[] = [];
    
    forecasts.forEach(forecast => {
      const rainProb = parseInt(forecast.rainProb);
      const hasThunder = forecast.weather.includes('雷');
      
      if (!hasThunder && rainProb < 30) {
        const startTime = new Date(forecast.timeStart).toLocaleString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour: '2-digit',
          minute: '2-digit'
        });
        const endTime = new Date(forecast.timeEnd).toLocaleString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour: '2-digit',
          minute: '2-digit'
        });
        safeSlots.push(`${startTime}-${endTime}`);
      }
    });
    
    return safeSlots;
  }

  /**
   * 獲取游泳安全圖示
   */
  private getSwimmingSafetyIcon(forecast: WeatherForecast): string {
    const rainProb = parseInt(forecast.rainProb);
    const hasThunder = forecast.weather.includes('雷');
    
    if (hasThunder) return '🚫 禁止游泳';
    if (rainProb < 20) return '✅ 安全';
    if (rainProb < 50) return '⚠️ 注意';
    return '❌ 不建議';
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
      return '✅ 天氣條件良好，適合游泳活動';
    }
  }

  /**
   * 格式化天氣預報為報告文字（保留原有功能）
   */
  formatWeatherForecast(forecasts: WeatherForecast[]): string {
    return this.formatDetailedSwimmingPoolForecast(forecasts);
  }
}

export const weatherService = new WeatherService();