/**
 * SSE Stream utilities for sending events to client
 */

import { appendLog } from './logger.js';

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
      const event = `event: status\ndata: ${data}\n\n`;
      appendLog('SSE', { event: 'status', type, message, ...extra });
      res.write(event);
    },

    /**
     * Send a content chunk
     * @param {string} content - content to send
     */
    sendContent(content) {
      const data = JSON.stringify({ content });
      const event = `event: content\ndata: ${data}\n\n`;
      appendLog('SSE', { event: 'content', contentLength: content?.length || 0, contentPreview: content?.substring(0, 100) });
      res.write(event);
    },

    /**
     * Send a clarify event (needs user input)
     * @param {object} clarify - clarify data
     */
    sendClarify(clarify) {
      const data = JSON.stringify(clarify);
      const event = `event: clarify\ndata: ${data}\n\n`;
      appendLog('SSE', { event: 'clarify', clarify });
      res.write(event);
    },

    /**
     * Send done event
     */
    sendDone() {
      appendLog('SSE', { event: 'done' });
      res.write('event: done\ndata: {}\n\n');
    },

    /**
     * Send error event
     * @param {string} error - error message
     */
    sendError(error) {
      const data = JSON.stringify({ error });
      appendLog('SSE', { event: 'error', error });
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
