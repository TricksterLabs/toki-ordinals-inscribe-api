import fs from 'fs';
import path from 'path';

// interface Logger {
//   log: (message: string) => void;
//   error: (message: string) => void;
// }

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Create a directory for the logs if it doesn't exist
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Get the current date and time
function getTimestamp() {
  const now = new Date();
  const timestamp = now.toISOString().slice(11, 19);
  return timestamp;
}

// Create a function to log messages
function log(message) {
  const now = new Date();
  const dateString = now.toISOString().slice(0, 10);
  const timeString = getTimestamp();
  const logFilename = `${dateString}.log`;
  const logPath = path.join(logDir, logFilename);
  const logMessage = `[${timeString}] [info] ${message}\n`;

  fs.appendFile(logPath, logMessage, err => {
    if (err) {
      console.error(`Error writing to log file ${logPath}: ${err.message}`);
    }
  });
}

// Create a function to log errors
function error(message) {
  const now = new Date();
  const dateString = now.toISOString().slice(0, 10);
  const timeString = getTimestamp();
  const logFilename = `${dateString}.log`;
  const logPath = path.join(logDir, logFilename);
  const logMessage = `[${timeString}] [error] ${message}\n`;

  fs.appendFile(logPath, logMessage, err => {
    if (err) {
      console.error(`Error writing to log file ${logPath}: ${err.message}`);
    }
  });
}

export const logger = {
  log,
  error,
};
