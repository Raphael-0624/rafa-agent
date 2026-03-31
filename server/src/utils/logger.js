/**
 * Simple file logger for debugging SSE events
 */
import fs from 'fs';
import path from 'path';

const LOG_DIR = process.cwd();
const LOG_FILE = path.join(LOG_DIR, 'chat-debug.log');

/**
 * Append a log entry to the log file
 * @param {string} source - Source of the log (e.g., 'SSE', 'Agent', 'API')
 * @param {object} data - Data to log
 */
export function appendLog(source, data) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    source,
    ...data
  };

  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

/**
 * Clear the log file
 */
export function clearLog() {
  try {
    fs.writeFileSync(LOG_FILE, '');
  } catch (err) {
    console.error('Failed to clear log:', err);
  }
}

/**
 * Get recent log entries
 * @param {number} lines - Number of lines to return
 * @returns {string} Log content
 */
export function getLog(lines = 50) {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return 'No log file found';
    }
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const logLines = content.trim().split('\n').filter(Boolean);
    return logLines.slice(-lines).join('\n');
  } catch (err) {
    return `Error reading log: ${err.message}`;
  }
}
