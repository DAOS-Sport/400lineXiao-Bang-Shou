/**
 * facilities 種子資料
 * 啟動時自動確認 8 個館別已存在於 DB
 */
import { db } from '../db';
import { facilities } from '@shared/schema';
import { eq } from 'drizzle-orm';

const SEED_FACILITIES = [
  { lineGroupId: 'C66a4b3bb3fbc3dcf52d42626ec512484', name: 'DAOS-新北高中（工作群）',  shortName: '新北高中', tier: 'A' },
  { lineGroupId: 'C6f6f163895d5b528a6ab044015e1a37b', name: 'DAOS-三重商工館（工作群）', shortName: '三重商工', tier: 'A' },
  { lineGroupId: 'C2dc6991e51074dd47d5d275d568318f7', name: 'DAOS-三民館（工作群）',     shortName: '三民館',   tier: 'A' },
  { lineGroupId: 'C9b3c5dfe2e005adafd2ed914714a1930', name: '駿斯-松山國小館',           shortName: '松山國小', tier: 'A' },
  { lineGroupId: 'C50c2a9623a78cc5f5e9f39557e3abfe6', name: '駿斯-竹科戶外游泳池',       shortName: '竹科游泳', tier: 'A' },
  { lineGroupId: 'C360be1fe6ea876a4df3ca0497bca4e3b', name: '駿斯-戶外運動園區',         shortName: '戶外運動', tier: 'A' },
  { lineGroupId: 'C2dd9a5fce7c276f2cbfdd02c2342661c', name: '駿斯-社區&勞務業務群',      shortName: '社區業務', tier: 'B' },
  { lineGroupId: 'Ce936c6bebb59b8b5683ffbcf97bf20de', name: '駿斯總部辦公室群',          shortName: '總部',     tier: 'B' },
];

export async function ensureFacilitiesSeeded(): Promise<void> {
  try {
    for (const f of SEED_FACILITIES) {
      const existing = await db
        .select({ id: facilities.id })
        .from(facilities)
        .where(eq(facilities.lineGroupId, f.lineGroupId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(facilities).values({
          lineGroupId: f.lineGroupId,
          name: f.name,
          shortName: f.shortName,
          tier: f.tier,
          isActive: true,
        });
        console.log(`✅ [facilitySeeder] 新增館別: ${f.name}`);
      }
    }
    console.log('✅ [facilitySeeder] 館別資料確認完成');
  } catch (err: any) {
    console.error('❌ [facilitySeeder] 種子資料失敗:', err?.message);
  }
}

/** 依 LINE group ID 取得 facility.id（常用工具） */
export async function getFacilityIdByGroupId(lineGroupId: string): Promise<number | null> {
  const rows = await db
    .select({ id: facilities.id })
    .from(facilities)
    .where(eq(facilities.lineGroupId, lineGroupId))
    .limit(1);
  return rows[0]?.id ?? null;
}
