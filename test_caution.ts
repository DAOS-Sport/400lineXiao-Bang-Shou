import { interviewCheckService } from './server/services/interviewCheckService';

async function test() {
  const userId = 'U1377e3b691add6a9b93699eb02dea502';
  const idCard = 'A127435688';
  
  console.log('=== 測試慎用名單查詢 ===');
  console.log(`用戶 ID: ${userId}`);
  console.log(`身分證: ${idCard}\n`);
  
  const result = await interviewCheckService.performInterviewCheck(userId, idCard);
  
  console.log('=== 回覆訊息 ===');
  console.log(result.combinedResult);
  
  process.exit(0);
}

test().catch(console.error);
