/**
 * 將 announcementConfig.ts 的 VIP_USERS 常數遷移到 DB
 * 執行：npx tsx scripts/seed_whitelist.ts
 */

import { db } from '../server/db';
import { announcementWhitelistUsers } from '../shared/schema';
import { VIP_USERS } from '../server/services/announcement/announcementConfig';

async function seed() {
  console.log('🌱 開始遷移 VIP_USERS 到 announcement_whitelist_users...');

  for (const [userId, userName] of Object.entries(VIP_USERS)) {
    try {
      await db.insert(announcementWhitelistUsers)
        .values({ userId, userName, role: 'vip', note: 'migrated from announcementConfig.ts', addedBy: 'system', isActive: true })
        .onConflictDoNothing();
      console.log(`  ✅ ${userName} (${userId})`);
    } catch (err: any) {
      console.error(`  ❌ ${userName} (${userId}):`, err?.message);
    }
  }

  const rows = await db.select().from(announcementWhitelistUsers);
  console.log(`\n完成。DB 共 ${rows.length} 筆白名單記錄。`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
