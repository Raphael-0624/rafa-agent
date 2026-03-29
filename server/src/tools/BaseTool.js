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
