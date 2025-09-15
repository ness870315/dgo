import winston from "winston";
import path from "path";

const logPath = path.join("/var/data", "logs", "app.log");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Logs to file (persistent)
    new winston.transports.File({ filename: logPath }),
    // Also log to console (Render captures this in dashboard logs)
    new winston.transports.Console(),
  ],
});

export default logger;
