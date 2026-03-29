import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// API 配置 - 默认使用阿里云 DashScope (兼容 Anthropic API)
const API_CONFIG = {
  // Anthropic / 阿里云 DashScope 格式
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
    model: process.env.ANTHROPIC_MODEL || 'kimi-k2.5',
  },
  // OpenAI 格式（备用）
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
  },
};

// 使用哪种 API 格式
const API_TYPE = process.env.API_TYPE || 'anthropic';

// 中间件
app.use(cors());
app.use(express.json());

// 限流保护
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 分钟
  max: 30, // 每分钟最多 30 次请求
  message: { error: '请求过于频繁，请稍后再试' },
});
app.use('/api', limiter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', apiType: API_TYPE, timestamp: new Date().toISOString() });
});

// 获取 API 配置（前端用）
app.get('/api/config', (req, res) => {
  res.json({
    apiType: API_TYPE,
    model: API_CONFIG[API_TYPE].model,
  });
});

// 流式聊天接口
app.post('/api/chat', async (req, res) => {
  const { messages, system } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  const config = API_CONFIG[API_TYPE];

  if (!config.apiKey) {
    return res.status(500).json({ error: 'API Key 未配置' });
  }

  try {
    // 设置流式响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let requestBody;
    let apiUrl;
    let headers;

    if (API_TYPE === 'anthropic') {
      // Anthropic / 阿里云 DashScope 格式
      apiUrl = `${config.baseUrl}/v1/messages`;
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      };
      requestBody = {
        model: config.model,
        messages: messages.filter(m => m.role !== 'system'),
        system: system || undefined,
        max_tokens: 4096,
        stream: true,
      };
    } else {
      // OpenAI 格式
      apiUrl = `${config.baseUrl}/chat/completions`;
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
      const allMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
      requestBody = {
        model: config.model,
        messages: allMessages,
        max_tokens: 4096,
        stream: true,
      };
    }

    // 发送请求到 AI API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      res.write(`data: ${JSON.stringify({ error: `API 错误: ${response.status}` })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        // 跳过 event: 行
        if (line.startsWith('event:')) {
          continue;
        }
        // 处理 data: 行（可能有空格也可能没有）
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();

          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            let content = '';

            if (API_TYPE === 'anthropic') {
              // Anthropic 格式 - 处理 content_block_delta
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                content = parsed.delta.text;
              }
            } else {
              // OpenAI 格式
              if (parsed.choices?.[0]?.delta?.content) {
                content = parsed.choices[0].delta.content;
              }
            }

            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Chat error:', error);
    res.write(`data: ${JSON.stringify({ error: '服务器错误: ' + error.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// 启动服务器
app.listen(PORT, () => {
  const currentConfig = API_CONFIG[API_TYPE];
  console.log(`🚀 Agent Assistant Server running on port ${PORT}`);
  console.log(`📡 API Type: ${API_TYPE}`);
  console.log(`🤖 Model: ${currentConfig.model}`);
});
