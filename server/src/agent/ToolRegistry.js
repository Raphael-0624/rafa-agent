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
