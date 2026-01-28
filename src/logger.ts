import { appendFile } from "fs/promises";
import { getLogPath } from "./utils/paths";

export class Logger {
  private enabled: boolean = false;
  private logFile: string = getLogPath();

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  async log(context: string, data: any) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${context}]\n${JSON.stringify(data, null, 2)}\n\n`;

    try {
      await appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error("[Logger] Failed to write to debug log:", error);
    }
  }
}

export const logger = new Logger(false);
