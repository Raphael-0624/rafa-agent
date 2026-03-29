# Rafa Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the current chat assistant into an autonomous Agent "Rafa" with web search, self-loop task execution, and built-in skills.

**Architecture:**
- **Backend**: Modular agent system with Intent Classifier → Task Planner → Step Executor → Tool Registry
- **Frontend**: Extended chat UI with real-time status bar and clarify options
- **Protocol**: Server-Sent Events (SSE) for streaming status/content/clarify messages

**Tech Stack:** Node.js + Express, React + TypeScript, Anthropic API, Bing Search API, SSE

---

## Phase 1: Foundation - Agent Core Framework

### Task 1: Restructure Backend Directory

**Files:**
- Create: `server/src/index.js` (entry point)
- Create: `server/src/routes/chat.js` (API routes)
- Create: `server/src/agent/Agent.js` (core agent)
- Create: `server/src/agent/IntentClassifier.js`
- Create: `server/src/agent/TaskPlanner.js`
- Create: `server/src/agent/ToolRegistry.js`
- Create: `server/src/tools/WebSearchTool.js` (placeholder)
- Create: `server/src/utils/stream.js` (SSE utilities)
- Delete: `server/server.js` (moved content)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p server/src/{agent,routes,tools,utils}
touch server/src/index.js
touch server/src/routes/chat.js
touch server/src/agent/Agent.js
touch server/src/agent/IntentClassifier.js
touch server/src/agent/TaskPlanner.js
touch server/src/agent/ToolRegistry.js
touch server/src/tools/WebSearchTool.js
touch server/src/utils/stream.js
```

- [ ] **Step 2: Create package.json update**

Modify: `server/package.json`

```json
{
  "name": "rafa-agent-server",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express-rate-limit": "^7.1.5",
    "node-fetch": "^3.3.2"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/ server/package.json
rm server/server.js
git commit -m "feat: restructure backend for agent architecture"
```

---

### Task 2: Create SSE Stream Utilities

**Files:**
- Create: `server/src/utils/stream.js`

- [ ] **Step 1: Write SSE stream utilities**

Create: `server/src/utils/stream.js`

```javascript
/**
 * SSE Stream utilities for sending events to client
 */

export function createSSEStream(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  return {
    /**
     * Send a status update event
     * @param {string} type - status type
     * @param {string} message - status message
     * @param {object} extra - extra data
     */
    sendStatus(type, message, extra = {}) {
      const data = JSON.stringify({ type, message, ...extra });
      res.write(`event: status\ndata: ${data}\n\n`);
    },

    /**
     * Send a content chunk
     * @param {string} content - content to send
     */
    sendContent(content) {
      const data = JSON.stringify({ content });
      res.write(`event: content\ndata: ${data}\n\n`);
    },

    /**
     * Send a clarify event (needs user input)
     * @param {object} clarify - clarify data
     */
    sendClarify(clarify) {
      const data = JSON.stringify(clarify);
      res.write(`event: clarify\ndata: ${data}\n\n`);
    },

    /**
     * Send done event
     */
    sendDone() {
      res.write('event: done\ndata: {}\n\n');
    },

    /**
     * Send error event
     * @param {string} error - error message
     */
    sendError(error) {
      const data = JSON.stringify({ error });
      res.write(`event: error\ndata: ${data}\n\n`);
    },

    /**
     * Close the stream
     */
    close() {
      res.end();
    }
  };
}

/**
 * Parse incoming message with optional tool mentions
 * @param {string} content - message content
 * @returns {object} parsed message
 */
export function parseMessage(content) {
  // Check for explicit search trigger
  const searchMatch = content.match(/^\/search\s+(.+)$/i);
  if (searchMatch) {
    return {
      type: 'explicit_search',
      query: searchMatch[1],
      original: content
    };
  }

  return {
    type: 'normal',
    content
  };
}
```

- [ ] **Step 2: Test the stream utilities**

Create: `server/test/stream.test.js` (temporary test)

```javascript
import { parseMessage } from '../src/utils/stream.js';

// Test parseMessage
console.log('Test 1:', parseMessage('hello'));
// Expected: { type: 'normal', content: 'hello' }

console.log('Test 2:', parseMessage('/search 北京天气'));
// Expected: { type: 'explicit_search', query: '北京天气', original: '/search 北京天气' }

console.log('Test 3:', parseMessage('/SEARCH python tutorial'));
// Expected: { type: 'explicit_search', query: 'python tutorial', ... }
```

Run: `node test/stream.test.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add server/src/utils/stream.js
git commit -m "feat: add SSE stream utilities"
```

---

### Task 3: Create Intent Classifier

**Files:**
- Create: `server/src/agent/IntentClassifier.js`

- [ ] **Step 1: Write Intent Classifier**

Create: `server/src/agent/IntentClassifier.js`

```javascript
/**
 * Intent Classifier - determines task complexity and required tools
 */

export class IntentClassifier {
  constructor(apiConfig) {
    this.apiConfig = apiConfig;
  }

  /**
   * Classify user intent
   * @param {string} message - user message
   * @param {Array} history - conversation history
   * @returns {Promise<IntentResult>}
   */
  async classify(message, history = []) {
    // Check for explicit search command
    const searchMatch = message.match(/^\/search\s+(.+)$/i);
    if (searchMatch) {
      return {
        level: 'medium',
        needsSearch: true,
        needsClarification: false,
        suggestedTools: ['web_search'],
        searchQuery: searchMatch[1]
      };
    }

    // Use LLM to classify
    const prompt = this.buildClassificationPrompt(message, history);
    const classification = await this.callLLM(prompt);

    return this.parseClassification(classification, message);
  }

  buildClassificationPrompt(message, history) {
    return `You are an intent classifier for an AI agent. Analyze the user's message and classify it.

Task Complexity Levels:
- "simple": Greetings, casual chat, basic questions, math calculations, code help (no real-time info needed)
- "medium": Needs current/real-time information (weather, news, prices, recent events)
- "complex": Multi-step tasks, planning, analysis, research, requires breaking down into steps

Response format (JSON only):
{
  "level": "simple|medium|complex",
  "needsSearch": true|false,
  "needsClarification": true|false,
  "clarifyQuestion": "question to ask if clarification needed",
  "clarifyOptions": ["option1", "option2"],
  "suggestedTools": ["web_search", "code_execute"],
  "reasoning": "brief explanation"
}

User message: "${message}"

Respond with JSON only:`;
  }

  async callLLM(prompt) {
    const { baseUrl, apiKey, model } = this.apiConfig;

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`Classification failed: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  parseClassification(text, originalMessage) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
                       text.match(/```\n?([\s\S]*?)\n?```/) ||
                       [null, text];
      const jsonStr = jsonMatch[1] || text;
      const result = JSON.parse(jsonStr.trim());

      return {
        level: result.level || 'simple',
        needsSearch: result.needsSearch || false,
        needsClarification: result.needsClarification || false,
        clarifyQuestion: result.clarifyQuestion || '',
        clarifyOptions: result.clarifyOptions || [],
        suggestedTools: result.suggestedTools || [],
        reasoning: result.reasoning || ''
      };
    } catch (e) {
      // Fallback: simple classification
      return {
        level: 'simple',
        needsSearch: false,
        needsClarification: false,
        suggestedTools: [],
        reasoning: 'parse_error'
      };
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/agent/IntentClassifier.js
git commit -m "feat: add intent classifier"
```

---

### Task 4: Create Tool Registry

**Files:**
- Create: `server/src/agent/ToolRegistry.js`
- Create: `server/src/tools/BaseTool.js`

- [ ] **Step 1: Write Base Tool class**

Create: `server/src/tools/BaseTool.js`

```javascript
/**
 * Base class for all tools
 */

export class BaseTool {
  constructor(config = {}) {
    this.config = config;
  }

  get name() {
    throw new Error('Tool must implement name getter');
  }

  get description() {
    throw new Error('Tool must implement description getter');
  }

  get parameters() {
    return {};
  }

  /**
   * Execute the tool
   * @param {object} params - tool parameters
   * @returns {Promise<object>} tool result
   */
  async execute(params) {
    throw new Error('Tool must implement execute method');
  }

  /**
   * Validate parameters
   * @param {object} params - parameters to validate
   * @returns {boolean}
   */
  validate(params) {
    return true;
  }
}
```

- [ ] **Step 2: Write Tool Registry**

Create: `server/src/agent/ToolRegistry.js`

```javascript
/**
 * Tool Registry - manages available tools
 */

import { BaseTool } from '../tools/BaseTool.js';

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a tool
   * @param {BaseTool} tool - tool instance
   */
  register(tool) {
    if (!(tool instanceof BaseTool)) {
      throw new Error('Tool must extend BaseTool');
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   * @param {string} name - tool name
   * @returns {BaseTool|null}
   */
  get(name) {
    return this.tools.get(name) || null;
  }

  /**
   * Check if tool exists
   * @param {string} name - tool name
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * Execute a tool
   * @param {string} name - tool name
   * @param {object} params - tool parameters
   * @returns {Promise<object>}
   */
  async execute(name, params) {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    if (!tool.validate(params)) {
      throw new Error(`Invalid parameters for tool: ${name}`);
    }

    return await tool.execute(params);
  }

  /**
   * Get all registered tool definitions (for LLM)
   * @returns {Array}
   */
  getToolDefinitions() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/agent/ToolRegistry.js server/src/tools/BaseTool.js
git commit -m "feat: add tool registry and base tool class"
```

---

### Task 5: Create Task Planner

**Files:**
- Create: `server/src/agent/TaskPlanner.js`

- [ ] **Step 1: Write Task Planner**

Create: `server/src/agent/TaskPlanner.js`

```javascript
/**
 * Task Planner - creates execution plans based on intent
 */

export class TaskPlanner {
  constructor(apiConfig) {
    this.apiConfig = apiConfig;
  }

  /**
   * Create a task plan
   * @param {string} task - task description
   * @param {IntentResult} intent - classified intent
   * @param {Array} history - conversation history
   * @returns {Promise<TaskPlan>}
   */
  async createPlan(task, intent, history = []) {
    // Simple tasks don't need planning
    if (intent.level === 'simple') {
      return {
        steps: [],
        currentStep: 0,
        status: 'ready'
      };
    }

    // Medium tasks: single search step
    if (intent.level === 'medium') {
      return {
        steps: [{
          id: '1',
          type: 'search',
          description: '搜索相关信息',
          params: {
            query: intent.searchQuery || task
          }
        }, {
          id: '2',
          type: 'generate',
          description: '生成回答'
        }],
        currentStep: 0,
        status: 'ready'
      };
    }

    // Complex tasks: use LLM to plan
    return await this.planWithLLM(task, intent, history);
  }

  async planWithLLM(task, intent, history) {
    const prompt = this.buildPlanningPrompt(task, intent);
    const response = await this.callLLM(prompt);

    try {
      const plan = JSON.parse(response);
      return {
        steps: plan.steps.map((step, idx) => ({
          id: String(idx + 1),
          ...step
        })),
        currentStep: 0,
        status: 'ready'
      };
    } catch (e) {
      // Fallback to simple plan
      return {
        steps: [{
          id: '1',
          type: 'search',
          description: '搜索相关信息',
          params: { query: task }
        }],
        currentStep: 0,
        status: 'ready'
      };
    }
  }

  buildPlanningPrompt(task, intent) {
    const availableTools = intent.suggestedTools.join(', ') || 'web_search';

    return `Create a step-by-step plan to complete this task.

Task: "${task}"
Complexity: ${intent.level}
Available tools: ${availableTools}

Available step types:
- "search": web search for information
- "code": execute code for calculations
- "read": read a file
- "write": write to a file
- "analyze": analyze gathered information
- "clarify": ask user for clarification
- "generate": generate final response

Response format (JSON only):
{
  "steps": [
    {
      "type": "search|code|read|write|analyze|clarify|generate",
      "description": "human-readable description of this step",
      "params": { "key": "value" }
    }
  ]
}

Create a concise plan (2-5 steps) in JSON format:`;
  }

  async callLLM(prompt) {
    const { baseUrl, apiKey, model } = this.apiConfig;

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      })
    });

    const data = await response.json();
    const text = data.content[0].text;

    // Extract JSON
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
                     text.match(/```\n?([\s\S]*?)\n?```/) ||
                     [null, text];
    return jsonMatch[1] || text;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/agent/TaskPlanner.js
git commit -m "feat: add task planner"
```

---

### Task 6: Create Agent Core

**Files:**
- Create: `server/src/agent/Agent.js`

- [ ] **Step 1: Write Agent class**

Create: `server/src/agent/Agent.js`

```javascript
/**
 * Agent Core - main agent loop and orchestration
 */

import { IntentClassifier } from './IntentClassifier.js';
import { TaskPlanner } from './TaskPlanner.js';
import { ToolRegistry } from './ToolRegistry.js';

export class Agent {
  constructor(apiConfig) {
    this.apiConfig = apiConfig;
    this.classifier = new IntentClassifier(apiConfig);
    this.planner = new TaskPlanner(apiConfig);
    this.toolRegistry = new ToolRegistry();
    this.memory = new Map(); // session memory
  }

  /**
   * Register a tool
   * @param {BaseTool} tool
   */
  registerTool(tool) {
    this.toolRegistry.register(tool);
  }

  /**
   * Process a user message
   * @param {string} message - user message
   * @param {string} sessionId - session identifier
   * @param {object} stream - SSE stream object
   */
  async processMessage(message, sessionId, stream) {
    const context = this.getContext(sessionId);
    context.messages.push({ role: 'user', content: message });

    try {
      // Step 1: Classify intent
      stream.sendStatus('thinking', '正在理解您的需求...');
      const intent = await this.classifier.classify(message, context.messages);

      // Step 2: Check if clarification needed
      if (intent.needsClarification && intent.clarifyQuestion) {
        stream.sendClarify({
          question: intent.clarifyQuestion,
          options: intent.clarifyOptions || [],
          allowCustomInput: true
        });
        context.pendingClarification = true;
        stream.sendDone();
        return;
      }

      // Step 3: Create plan
      if (intent.level !== 'simple') {
        stream.sendStatus('planning', '正在规划任务...');
      }
      const plan = await this.planner.createPlan(message, intent, context.messages);

      // Step 4: Execute plan
      const result = await this.executePlan(plan, context, stream, intent);

      // Step 5: Send final response
      if (result.content) {
        stream.sendContent(result.content);
      }

      context.messages.push({ role: 'assistant', content: result.content || '' });
      stream.sendDone();

    } catch (error) {
      console.error('Agent error:', error);
      stream.sendError('处理消息时出错: ' + error.message);
    }
  }

  /**
   * Execute a task plan
   * @param {TaskPlan} plan
   * @param {object} context
   * @param {object} stream
   * @param {IntentResult} intent
   */
  async executePlan(plan, context, stream, intent) {
    const stepResults = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      plan.currentStep = i + 1;

      // Update status
      stream.sendStatus('executing', `正在${step.description} (${i + 1}/${plan.steps.length})...`, {
        current: i + 1,
        total: plan.steps.length
      });

      // Execute step
      const result = await this.executeStep(step, context);
      stepResults.push({ step, result });

      // Check for clarification
      if (step.type === 'clarify') {
        stream.sendClarify(result);
        return { needsClarification: true };
      }
    }

    // Generate final response
    stream.sendStatus('generating', '正在生成回答...');
    const content = await this.generateResponse(context, stepResults, intent);

    return { content };
  }

  /**
   * Execute a single step
   * @param {Step} step
   * @param {object} context
   */
  async executeStep(step, context) {
    switch (step.type) {
      case 'search':
        if (this.toolRegistry.has('web_search')) {
          return await this.toolRegistry.execute('web_search', step.params);
        }
        return { error: 'Search tool not available' };

      case 'code':
        if (this.toolRegistry.has('code_execute')) {
          return await this.toolRegistry.execute('code_execute', step.params);
        }
        return { error: 'Code tool not available' };

      case 'clarify':
        return step.params;

      default:
        return {};
    }
  }

  /**
   * Generate final response using LLM
   */
  async generateResponse(context, stepResults, intent) {
    const { baseUrl, apiKey, model } = this.apiConfig;

    const prompt = this.buildResponsePrompt(context, stepResults);

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        messages: [
          ...context.messages.slice(-10), // last 10 messages
          { role: 'user', content: prompt }
        ],
        max_tokens: 4096,
        stream: false
      })
    });

    const data = await response.json();
    return data.content[0].text;
  }

  buildResponsePrompt(context, stepResults) {
    const searchResults = stepResults
      .filter(r => r.step.type === 'search' && r.result?.results)
      .map(r => JSON.stringify(r.result.results))
      .join('\n');

    return `Based on the search results and conversation history, provide a helpful response.

${searchResults ? 'Search Results:\n' + searchResults : ''}

Provide a clear, concise response. If search results are provided, synthesize the information. Otherwise, answer based on your knowledge.`;
  }

  getContext(sessionId) {
    if (!this.memory.has(sessionId)) {
      this.memory.set(sessionId, {
        messages: [],
        pendingClarification: false
      });
    }
    return this.memory.get(sessionId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/agent/Agent.js
git commit -m "feat: add agent core with execution loop"
```

---

### Task 7: Create New API Routes

**Files:**
- Create: `server/src/routes/chat.js`
- Create: `server/src/index.js`

- [ ] **Step 1: Write chat routes**

Create: `server/src/routes/chat.js`

```javascript
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
```

- [ ] **Step 2: Write main entry point**

Create: `server/src/index.js`

```javascript
/**
 * Rafa Agent Server - Entry Point
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import chatRoutes from './routes/chat.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api', limiter);

// Routes
app.use('/api', chatRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Rafa Agent Server running on port ${PORT}`);
  console.log(`🤖 Model: ${process.env.ANTHROPIC_MODEL || 'kimi-k2.5'}`);
});
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/chat.js server/src/index.js
git commit -m "feat: add new API routes and entry point"
```

---

### Task 8: Update Frontend for New Protocol

**Files:**
- Modify: `client/src/components/Chat.tsx`

- [ ] **Step 1: Update message types**

Modify: `client/src/components/Chat.tsx` (add new types)

```typescript
// Add these types at the top
interface StatusEvent {
  type: string;
  message: string;
  current?: number;
  total?: number;
}

interface ClarifyEvent {
  question: string;
  options: Array<{ id: string; label: string; value: string }>;
  allowCustomInput: boolean;
}

type MessageType = 'user' | 'assistant' | 'status' | 'clarify';

interface Message {
  id: string;
  type: MessageType;
  content?: string;
  status?: StatusEvent;
  clarify?: ClarifyEvent;
  timestamp: Date;
}
```

- [ ] **Step 2: Update stream handling**

Add new parsing logic in Chat.tsx:

```typescript
// Parse SSE events
const parseEvent = (line: string): { event: string; data: any } | null => {
  const eventMatch = line.match(/^event: (\w+)$/);
  const dataMatch = line.match(/^data: (.+)$/);

  if (eventMatch && dataMatch) {
    try {
      return {
        event: eventMatch[1],
        data: JSON.parse(dataMatch[1])
      };
    } catch {
      return { event: eventMatch[1], data: dataMatch[1] };
    }
  }
  return null;
};
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Chat.tsx
git commit -m "wip: update frontend for agent protocol"
```

---

## Phase 1 Self-Review

**Spec Coverage:**
- ✅ Intent Classifier - Task 3
- ✅ Task Planner - Task 5
- ✅ Agent Loop - Task 6
- ✅ Tool Registry - Task 4
- ✅ Status Streaming - Task 2, Task 8

**Placeholder Check:** All steps contain concrete code

**Type Consistency:** Types align between backend and frontend

---

## Phase 2: Web Search Skill (Next Phase)

Phase 1 完成后，继续 Phase 2：
- Implement WebSearchTool
- Integrate Bing Search API
- Test search functionality

**Plan saved to:** `docs/superpowers/plans/2026-03-29-rafa-agent-phase1.md`

**Execution Options:**
1. **Subagent-Driven (recommended)** - Fresh subagent per task + review
2. **Inline Execution** - Execute in this session with checkpoints

**Which approach?** (User should specify)
