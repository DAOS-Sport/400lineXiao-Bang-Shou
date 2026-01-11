import { interviewCheckService } from './server/services/interviewCheckService';

async function test() {
  const userId = 'U1377e3b691add6a9b93699eb02dea502';
  const idCard = 'A229217582';
  
  const result = await interviewCheckService.performInterviewCheck(userId, idCard);
  
  console.log('=== 回覆訊息 ===');
  console.log(result.combinedResult);
  
  process.exit(0);
}

test().catch(console.error);
