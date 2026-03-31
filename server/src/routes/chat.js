/**
 * Chat API routes
 */

import express from 'express';
import { Agent } from '../agent/Agent.js';
import { createSSEStream } from '../utils/stream.js';
import { WebSearchTool } from '../tools/WebSearchTool.js';
import { appendLog, getLog, clearLog } from '../utils/logger.js';

const router = express.Router();

// Initialize agent with API config - using Anthropic format with fixed parser
const apiConfig = {
  baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  model: 'kimi-k2.5'
};

console.log('[Agent] API Config:', { baseUrl: apiConfig.baseUrl, model: apiConfig.model, hasKey: !!apiConfig.apiKey });

const agent = new Agent(apiConfig);

// Register tools
const searchTool = new WebSearchTool({
  tavilyKey: process.env.TAVILY_API_KEY,
  serperKey: process.env.SERPER_API_KEY
});
agent.registerTool(searchTool);

console.log('[Agent] WebSearchTool registered with providers: Tavily → Serper → DuckDuckGo');

/**
 * POST /api/chat - Stream chat with agent
 */
router.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  clearLog();
  appendLog('ChatRoute', { action: 'chat.start', message, sessionId });

  const stream = createSSEStream(res);
  await agent.processMessage(message, sessionId, stream);
});

/**
 * GET /api/health - Health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'rafa',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/debug/logs - Get recent logs
 */
router.get('/debug/logs', (req, res) => {
  const logs = getLog(100);
  res.type('text/plain').send(logs);
});

/**
 * POST /api/test/direct - Direct API test without agent logic
 */
router.post('/test/direct', async (req, res) => {
  const { message = 'Hello, how are you?' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    res.write(`event: status\ndata: ${JSON.stringify({ type: 'testing', message: '直接测试 API...' })}\n\n`);

    const response = await fetch(`${apiConfig.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [{ role: 'user', content: message }],
        max_tokens: 1024
      })
    });

    res.write(`event: status\ndata: ${JSON.stringify({ type: 'testing', message: `API 状态: ${response.status}` })}\n\n`);

    if (!response.ok) {
      const errorText = await response.text();
      res.write(`event: error\ndata: ${JSON.stringify({ error: `API ${response.status}: ${errorText}` })}\n\n`);
      res.write(`event: done\ndata: {}\n\n`);
      return;
    }

    const data = await response.json();

    // Log full response for debugging
    res.write(`event: status\ndata: ${JSON.stringify({ type: 'testing', message: `完整响应: ${JSON.stringify(data).substring(0, 500)}` })}\n\n`);

    // Try to extract content
    let content = null;
    let format = 'unknown';

    if (data.content && Array.isArray(data.content)) {
      // Find text type content
      const textContent = data.content.find(c => c.type === 'text');
      if (textContent?.text) {
        content = textContent.text;
        format = 'anthropic-v2';
      } else if (data.content[0]?.text) {
        content = data.content[0].text;
        format = 'anthropic';
      }
    } else if (data.choices && data.choices[0]?.message?.content) {
      content = data.choices[0].message.content;
      format = 'openai';
    } else if (data.output?.text) {
      content = data.output.text;
      format = 'dashscope';
    } else if (data.text) {
      content = data.text;
      format = 'text';
    }

    res.write(`event: status\ndata: ${JSON.stringify({ type: 'testing', message: `格式: ${format}` })}\n\n`);

    if (content) {
      res.write(`event: content\ndata: ${JSON.stringify({ content })}\n\n`);
    } else {
      res.write(`event: content\ndata: ${JSON.stringify({ content: '无法解析响应: ' + JSON.stringify(data).substring(0, 200) })}\n\n`);
    }

    res.write(`event: done\ndata: {}\n\n`);

  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
  }
});

export default router;
