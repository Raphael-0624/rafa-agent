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
