/**
 * Structured logging utility for Cloudflare Workers observability.
 * Outputs JSON-formatted logs that are automatically collected by Workers Logs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEvent =
  | 'request.start'
  | 'request.complete'
  | 'request.error'
  | 'provider.attempt'
  | 'provider.success'
  | 'provider.failure'
  | 'provider.timeout'
  | 'circuit_breaker.skip'
  | 'circuit_breaker.cooldown'
  | 'circuit_breaker.reset'
  | 'safety_valve.triggered'
  | 'auth.failure'
  | 'config.load';

interface BaseLogData {
  requestId?: string;
  model?: string;
  provider?: string;
  status?: number;
  latency?: number;
  error?: string;
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: LogEvent;
  message: string;
  requestId?: string;
  data?: BaseLogData;
}

class Logger {
  private requestId?: string;
  private debugMode: boolean;

  constructor(requestId?: string, debugMode: boolean = false) {
    this.requestId = requestId;
    this.debugMode = debugMode;
  }

  /**
   * Create a child logger with the same requestId but potentially different debug setting
   */
  child(requestId: string): Logger {
    return new Logger(requestId, this.debugMode);
  }

  private log(level: LogLevel, event: LogEvent, message: string, data?: BaseLogData): void {
    // Skip debug logs unless debug mode is enabled
    if (level === 'debug' && !this.debugMode) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      ...(this.requestId && { requestId: this.requestId }),
      ...(data && { data }),
    };

    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error(JSON.stringify(entry));
        break;
      case 'warn':
        console.warn(JSON.stringify(entry));
        break;
      default:
        console.log(JSON.stringify(entry));
    }
  }

  info(event: LogEvent, message: string, data?: BaseLogData): void {
    this.log('info', event, message, data);
  }

  warn(event: LogEvent, message: string, data?: BaseLogData): void {
    this.log('warn', event, message, data);
  }

  error(event: LogEvent, message: string, data?: BaseLogData): void {
    this.log('error', event, message, data);
  }

  debug(event: LogEvent, message: string, data?: BaseLogData): void {
    this.log('debug', event, message, data);
  }
}

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a logger instance with optional request ID
 */
export function createLogger(requestId?: string, debug: boolean = false): Logger {
  return new Logger(requestId, debug);
}
