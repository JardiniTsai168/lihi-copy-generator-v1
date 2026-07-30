(async () => {
  try {
    const start = Date.now();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENROUTER_API_KEY');
    }
    console.log('Starting OpenRouter API call...');
    
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://copy.bktsai.link',
        'X-Title': 'Test'
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.5-plus-02-15',
        messages: [
          {role: 'system', content: '你是一個助手'},
          {role: 'user', content: '你好，請回答這個問題：1+1=?'}
        ],
        max_tokens: 50
      })
    });
    
    const data = await resp.json();
    console.log('Response time:', Date.now() - start, 'ms');
    console.log('Status:', resp.status);
    console.log('Content:', data.choices?.[0]?.message?.content);
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
