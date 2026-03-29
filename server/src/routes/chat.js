/**
 * Chat API routes
 */

import express from 'express';
import { Agent } from '../agent/Agent.js';
import { createSSEStream } from '../utils/stream.js';

const router = express.Router();

// Initialize agent with API config
const apiConfig = {
  baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  model: process.env.ANTHROPIC_MODEL || 'kimi-k2.5'
};

const agent = new Agent(apiConfig);

/**
 * POST /api/chat - Stream chat with agent
 */
router.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

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

export default router;
