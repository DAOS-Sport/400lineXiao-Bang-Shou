async function test() {
  const apiKey = process.env.RAGIC_API_KEY || '';
  const domain = process.env.RAGIC_DOMAIN || '';
  const databaseId = process.env.RAGIC_DATABASE_ID || '';
  const idCard = 'A127435688';
  
  const url = `https://${domain}/${databaseId}/5?api&where=1003930,eq,${encodeURIComponent(idCard)}`;
  
  console.log('URL:', url);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log('Raw data:', JSON.stringify(data, null, 2));
  
  process.exit(0);
}

test().catch(console.error);
