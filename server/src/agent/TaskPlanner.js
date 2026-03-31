import { appendLog } from '../utils/logger.js';

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

    appendLog('TaskPlanner', { action: 'callLLM.start', baseUrl, model });

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
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000
        })
      });

      appendLog('TaskPlanner', { action: 'callLLM.response', status: response.status });

      if (!response.ok) {
        const errorText = await response.text();
        appendLog('TaskPlanner', { action: 'callLLM.error', status: response.status, error: errorText });
        throw new Error(`Planner API error: ${response.status}`);
      }

      const data = await response.json();

      // Try multiple response formats
      let text = null;

      if (data.content && Array.isArray(data.content)) {
        // Find text type content (newer format)
        const textContent = data.content.find(c => c.type === 'text');
        if (textContent?.text) {
          text = textContent.text;
          appendLog('TaskPlanner', { action: 'callLLM.format', format: 'anthropic-v2' });
        } else if (data.content[0]?.text) {
          text = data.content[0].text;
          appendLog('TaskPlanner', { action: 'callLLM.format', format: 'anthropic' });
        }
      } else if (data.choices && data.choices[0]?.message?.content) {
        text = data.choices[0].message.content;
        appendLog('TaskPlanner', { action: 'callLLM.format', format: 'openai' });
      } else if (data.output?.text) {
        text = data.output.text;
        appendLog('TaskPlanner', { action: 'callLLM.format', format: 'dashscope' });
      } else if (typeof data === 'string') {
        text = data;
        appendLog('TaskPlanner', { action: 'callLLM.format', format: 'string' });
      } else {
        appendLog('TaskPlanner', { action: 'callLLM.unknownFormat', data: JSON.stringify(data).substring(0, 500) });
        text = JSON.stringify(data);
      }

      // Extract JSON
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ||
                       text.match(/```\n?([\s\S]*?)\n?```/) ||
                       [null, text];
      const result = jsonMatch[1] || text;
      appendLog('TaskPlanner', { action: 'callLLM.result', resultLength: result.length });

      return result;
    } catch (error) {
      appendLog('TaskPlanner', { action: 'callLLM.exception', error: error.message });
      throw error;
    }
  }
}
