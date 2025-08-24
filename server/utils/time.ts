import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dayjs/locale/zh-tw.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('zh-tw');

// 設定預設時區為台北
const TZ = 'Asia/Taipei';

export function now(): dayjs.Dayjs {
  return dayjs().tz(TZ);
}

export function getYesterday(): Date {
  return now().subtract(1, 'day').toDate();
}

export function getYesterdayRange(): { start: Date; end: Date } {
  const yesterday = now().subtract(1, 'day');
  return {
    start: yesterday.startOf('day').toDate(),
    end: yesterday.endOf('day').toDate()
  };
}

export function getLast24HoursRange(): { start: Date; end: Date } {
  const nowTime = now();
  return {
    start: nowTime.subtract(24, 'hour').toDate(),
    end: nowTime.toDate()
  };
}

export function formatDate(date: Date): string {
  return dayjs(date).tz(TZ).format('YYYY/MM/DD');
}

export function formatDateTime(date: Date): string {
  return dayjs(date).tz(TZ).format('YYYY/MM/DD HH:mm:ss');
}

export function getTodayStart(): Date {
  return now().startOf('day').toDate();
}

export function getTodayEnd(): Date {
  return now().endOf('day').toDate();
}

export function getDateRange(days: number): { start: Date; end: Date } {
  const end = now().toDate();
  const start = now().subtract(days, 'day').toDate();
  return { start, end };
}

export function getOneMonthAgo(): Date {
  return now().subtract(1, 'month').toDate();
}

export function getOneMonthRange(): { start: Date; end: Date } {
  const oneMonthAgo = now().subtract(1, 'month');
  return {
    start: oneMonthAgo.startOf('day').toDate(),
    end: now().toDate()
  };
}
