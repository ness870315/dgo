import winston from "winston";
import path from "path";
import fs from "fs";
import axios from "axios";

// Ensure log directory exists
const logDir = "/var/data/logs";
const logPath = path.join(logDir, "app.log");

try {
  fs.mkdirSync(logDir, { recursive: true });
} catch (error) {
  console.warn('Could not create log directory:', error.message);
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Logs to file (persistent)
    new winston.transports.File({ 
      filename: logPath,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    // Also log to console (Render captures this in dashboard logs)
    new winston.transports.Console(),
  ],
});

export default logger;
