import { db } from '../db';
import { interviewAuthorizedUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';

const AUTHORIZED_USERS = [
  { userId: 'U2e4e3766364714c9f6b223b530cd051e', userName: '蔣碩仁' },
  { userId: 'U6f29669dd3afff70c18c37f4cd3ea801', userName: '夏凱莉' },
  { userId: 'Uf8dc91d771a183d76a920ed4dbe84031', userName: '莊嘉郡' },
  { userId: 'U8fd0e4be4e44a1304f9fa2e9855f4559', userName: '陳柏榮' },
  { userId: 'U43a939938384fe34da7a136ab51fdf6a', userName: '夏鈺婷' },
  { userId: 'Ue96d3a9e804ebbb9660589d81aa52e57', userName: '莊嘉容' },
  { userId: 'U1377e3b691add6a9b93699eb02dea502', userName: '莊柏彥' },
  { userId: 'U85897f6b8b944c4710ad5eb61b516cfd', userName: '吳承晏' },
];

export async function initializeAuthorizedUsers(): Promise<void> {
  console.log('🔧 檢查面試檢核授權用戶...');
  
  try {
    for (const user of AUTHORIZED_USERS) {
      const [existing] = await db.select()
        .from(interviewAuthorizedUsers)
        .where(eq(interviewAuthorizedUsers.userId, user.userId));
      
      if (!existing) {
        await db.insert(interviewAuthorizedUsers).values({
          userId: user.userId,
          userName: user.userName,
          canInterviewCheck: 'true',
          canInternalQuery: 'true',
          canUseAiAgent: 'true',
          isActive: 'true',
        });
        console.log(`✅ 新增授權用戶: ${user.userName} (${user.userId})`);
      } else if (existing.canUseAiAgent !== 'true') {
        await db.update(interviewAuthorizedUsers)
          .set({ canUseAiAgent: 'true' })
          .where(eq(interviewAuthorizedUsers.userId, user.userId));
        console.log(`🔄 更新 AI 客服權限: ${user.userName} (${user.userId})`);
      }
    }
    
    const count = await db.select().from(interviewAuthorizedUsers);
    console.log(`✅ 面試檢核授權用戶總數: ${count.length} 人`);
  } catch (error) {
    console.error('❌ 初始化授權用戶失敗:', error);
  }
}
