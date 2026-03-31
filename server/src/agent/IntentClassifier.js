import { appendLog } from '../utils/logger.js';

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

    appendLog('IntentClassifier', { action: 'callLLM.start', baseUrl, model });

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
          max_tokens: 500
        })
      });

      appendLog('IntentClassifier', { action: 'callLLM.response', status: response.status, statusText: response.statusText });

      if (!response.ok) {
        const errorText = await response.text();
        appendLog('IntentClassifier', { action: 'callLLM.error', status: response.status, error: errorText });
        throw new Error(`Classification failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      appendLog('IntentClassifier', { action: 'callLLM.data', dataKeys: Object.keys(data) });

      // Try multiple response formats
      let text = null;

      if (data.content && Array.isArray(data.content)) {
        // Find text type content (newer format)
        const textContent = data.content.find(c => c.type === 'text');
        if (textContent?.text) {
          text = textContent.text;
          appendLog('IntentClassifier', { action: 'callLLM.format', format: 'anthropic-v2' });
        } else if (data.content[0]?.text) {
          text = data.content[0].text;
          appendLog('IntentClassifier', { action: 'callLLM.format', format: 'anthropic' });
        }
      } else if (data.choices && data.choices[0]?.message?.content) {
        text = data.choices[0].message.content;
        appendLog('IntentClassifier', { action: 'callLLM.format', format: 'openai' });
      } else if (data.output?.text) {
        text = data.output.text;
        appendLog('IntentClassifier', { action: 'callLLM.format', format: 'dashscope' });
      } else if (typeof data === 'string') {
        text = data;
        appendLog('IntentClassifier', { action: 'callLLM.format', format: 'string' });
      } else {
        appendLog('IntentClassifier', { action: 'callLLM.unknownFormat', data: JSON.stringify(data).substring(0, 500) });
        text = JSON.stringify(data);
      }

      return text;
    } catch (error) {
      appendLog('IntentClassifier', { action: 'callLLM.exception', error: error.message, stack: error.stack });
      throw error;
    }
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
