async function test() {
  const apiKey = process.env.RAGIC_API_KEY || '';
  const databaseId = process.env.RAGIC_DATABASE_ID || '';
  
  const urlObj = new URL(databaseId);
  const baseUrl = `https://${urlObj.hostname}${urlObj.pathname.replace(/\/$/, '')}`;
  
  console.log('Base URL:', baseUrl);
  
  // 嘗試不同的 sheet index
  for (const idx of ['1', '2', '3', '4', '5']) {
    const url = `${baseUrl}/${idx}?api&limit=1`;
    console.log(`\nTrying sheet ${idx}...`);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      const keys = Object.keys(data).filter(k => k !== 'status');
      console.log(`  Status: ${response.status}, Records: ${keys.length}`);
      if (keys.length > 0) {
        const firstKey = keys[0];
        const record = data[firstKey] as any;
        const fieldIds = Object.keys(record).slice(0, 10);
        console.log(`  Fields: ${fieldIds.join(', ')}`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  process.exit(0);
}

test().catch(console.error);
