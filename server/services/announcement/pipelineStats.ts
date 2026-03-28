interface DayStats {
  date: string;
  totalChecked: number;
  preFilterPass: number;
  gptClassified: number;
  stored: number;
  supervisorChecked: number;
  focusGroupChecked: number;
  skippedLowConf: number;
}

let stats: DayStats = {
  date: '',
  totalChecked: 0,
  preFilterPass: 0,
  gptClassified: 0,
  stored: 0,
  supervisorChecked: 0,
  focusGroupChecked: 0,
  skippedLowConf: 0,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetIfNewDay(): void {
  const today = todayKey();
  if (stats.date !== today) {
    stats = {
      date: today,
      totalChecked: 0,
      preFilterPass: 0,
      gptClassified: 0,
      stored: 0,
      supervisorChecked: 0,
      focusGroupChecked: 0,
      skippedLowConf: 0,
    };
  }
}

export function inc(key: keyof Omit<DayStats, 'date'>): void {
  resetIfNewDay();
  stats[key]++;
}

export function getPipelineStats(): DayStats & { preFilterRate: string; storageRate: string } {
  resetIfNewDay();
  const preFilterRate = stats.totalChecked > 0
    ? `${((stats.preFilterPass / stats.totalChecked) * 100).toFixed(1)}%`
    : 'N/A';
  const storageRate = stats.gptClassified > 0
    ? `${((stats.stored / stats.gptClassified) * 100).toFixed(1)}%`
    : 'N/A';
  return { ...stats, preFilterRate, storageRate };
}
