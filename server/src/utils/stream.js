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
