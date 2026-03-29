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
