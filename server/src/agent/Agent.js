/**
 * Agent Core - main agent loop and orchestration
 */

import { IntentClassifier } from './IntentClassifier.js';
import { TaskPlanner } from './TaskPlanner.js';
import { ToolRegistry } from './ToolRegistry.js';
import { appendLog } from '../utils/logger.js';

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

    appendLog('Agent', { action: 'processMessage.start', messageLength: message.length, sessionId });

    try {
      // Step 1: Classify intent
      stream.sendStatus('thinking', '正在理解您的需求...');
      const intent = await this.classifier.classify(message, context.messages);
      appendLog('Agent', { action: 'classify.complete', intent });

      // Step 2: Check if clarification needed
      if (intent.needsClarification && intent.clarifyQuestion) {
        // Convert string options to object format if needed
        const formattedOptions = (intent.clarifyOptions || []).map((opt, idx) => {
          if (typeof opt === 'string') {
            return { id: String(idx), label: opt, value: opt };
          }
          return { id: opt.id || String(idx), label: opt.label || opt.value || String(opt), value: opt.value || opt.label || String(opt) };
        });

        stream.sendClarify({
          question: intent.clarifyQuestion,
          options: formattedOptions,
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
      appendLog('Agent', { action: 'plan.complete', steps: plan.steps?.length });

      // Step 4: Execute plan
      const result = await this.executePlan(plan, context, stream, intent);
      appendLog('Agent', { action: 'executePlan.complete', hasContent: !!result.content, contentLength: result.content?.length });

      // Step 5: Send final response
      if (result.content) {
        appendLog('Agent', { action: 'sendContent', contentLength: result.content.length, contentPreview: result.content.substring(0, 200) });
        stream.sendContent(result.content);
      } else {
        appendLog('Agent', { action: 'sendContent.empty', result });
        stream.sendContent('抱歉，我没有生成有效的回复。');
      }

      context.messages.push({ role: 'assistant', content: result.content || '' });
      stream.sendDone();

    } catch (error) {
      console.error('Agent error:', error);
      appendLog('Agent', { action: 'processMessage.error', error: error.message, stack: error.stack });
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

    appendLog('Agent', { action: 'generateResponse.start', model, baseUrl });

    try {
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
          max_tokens: 4096
        })
      });

      appendLog('Agent', { action: 'generateResponse.apiResponse', status: response.status, statusText: response.statusText });

      if (!response.ok) {
        const errorText = await response.text();
        appendLog('Agent', { action: 'generateResponse.apiError', status: response.status, error: errorText });
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      appendLog('Agent', { action: 'generateResponse.apiData', dataKeys: Object.keys(data) });

      // Handle different response formats
      let content = null;
      appendLog('Agent', { action: 'generateResponse.rawData', data: JSON.stringify(data).substring(0, 1000) });

      if (data.content && Array.isArray(data.content)) {
        // Find text type content (newer anthropic format)
        const textContent = data.content.find(c => c.type === 'text');
        if (textContent?.text) {
          content = textContent.text;
          appendLog('Agent', { action: 'generateResponse.format', format: 'anthropic-v2', contentLength: content.length });
        } else if (data.content[0]?.text) {
          content = data.content[0].text;
          appendLog('Agent', { action: 'generateResponse.format', format: 'anthropic', contentLength: content.length });
        }
      } else if (data.choices && data.choices[0]?.message?.content) {
        // OpenAI format
        content = data.choices[0].message.content;
        appendLog('Agent', { action: 'generateResponse.format', format: 'openai', contentLength: content.length });
      } else if (data.output?.text) {
        // DashScope format
        content = data.output.text;
        appendLog('Agent', { action: 'generateResponse.format', format: 'dashscope', contentLength: content.length });
      } else if (data.role === 'assistant' && data.content) {
        // Direct response format from kimi
        content = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
        appendLog('Agent', { action: 'generateResponse.format', format: 'direct', contentLength: content.length });
      } else if (typeof data === 'string') {
        content = data;
        appendLog('Agent', { action: 'generateResponse.format', format: 'string', contentLength: content.length });
      } else {
        appendLog('Agent', { action: 'generateResponse.unknownFormat', data: JSON.stringify(data).substring(0, 500) });
        content = JSON.stringify(data);
      }

      return content;
    } catch (error) {
      appendLog('Agent', { action: 'generateResponse.error', error: error.message, stack: error.stack });
      throw error;
    }
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
