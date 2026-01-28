import Database from "better-sqlite3";
import * as path from "path";
import { getDbPath } from "./utils/paths";

export interface RequestLog {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  requestHeaders: string;
  requestBody: string;
  model: string | null;
  responseStatus: number | null;
  responseHeaders: string | null;
  responseBody: string | null;
  providerUsed: string | null;
  fallbackTriggered: number;
  attemptCount: number;
  durationMs: number | null;
}

export interface LoggingConfig {
  enabled: boolean;
  logResponseBody: boolean;
  dbPath: string;
  maxSavedMessages: number;
}

const DEFAULT_CONFIG: LoggingConfig = {
  enabled: true,
  logResponseBody: true,
  dbPath: getDbPath(),
  maxSavedMessages: 1000,
};

class LogDatabase {
  private db: Database.Database | null = null;
  private config: LoggingConfig = DEFAULT_CONFIG;
  private insertStmt: Database.Statement | null = null;
  private countStmt: Database.Statement | null = null;
  private cleanupStmt: Database.Statement | null = null;

  init(config: Partial<LoggingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.enabled) {
      console.log("[LogDB] Logging is disabled");
      return;
    }

    const dbPath = path.isAbsolute(this.config.dbPath)
      ? this.config.dbPath
      : path.resolve(process.cwd(), this.config.dbPath);
    this.db = new Database(dbPath);

    // Create table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT UNIQUE,
        timestamp TEXT,
        method TEXT,
        path TEXT,
        request_headers TEXT,
        request_body TEXT,
        model TEXT,
        response_status INTEGER,
        response_headers TEXT,
        response_body TEXT,
        provider_used TEXT,
        fallback_triggered INTEGER,
        attempt_count INTEGER,
        duration_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp ON request_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_model ON request_logs(model);
      CREATE INDEX IF NOT EXISTS idx_provider ON request_logs(provider_used);
      CREATE INDEX IF NOT EXISTS idx_status ON request_logs(response_status);
    `);

    // Prepare statements
    this.insertStmt = this.db.prepare(`
      INSERT INTO request_logs (
        request_id, timestamp, method, path,
        request_headers, request_body, model,
        response_status, response_headers, response_body,
        provider_used, fallback_triggered, attempt_count, duration_ms
      ) VALUES (
        @requestId, @timestamp, @method, @path,
        @requestHeaders, @requestBody, @model,
        @responseStatus, @responseHeaders, @responseBody,
        @providerUsed, @fallbackTriggered, @attemptCount, @durationMs
      )
    `);

    this.countStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM request_logs"
    );

    this.cleanupStmt = this.db.prepare(`
      DELETE FROM request_logs
      WHERE id NOT IN (
        SELECT id FROM request_logs
        ORDER BY created_at DESC
        LIMIT ?
      )
    `);

    console.log(
      `[LogDB] Initialized SQLite database at ${dbPath}. Max messages: ${this.config.maxSavedMessages}`
    );
  }

  insertLog(log: RequestLog) {
    if (!this.db || !this.insertStmt || !this.config.enabled) {
      return;
    }

    try {
      // Filter response body if not enabled
      const logData = {
        ...log,
        responseBody: this.config.logResponseBody ? log.responseBody : null,
      };

      this.insertStmt.run(logData);

      // Check and cleanup old records
      this.cleanup();
    } catch (error) {
      console.error("[LogDB] Failed to insert log:", error);
    }
  }

  private cleanup() {
    if (!this.db || !this.countStmt || !this.cleanupStmt) {
      return;
    }

    try {
      const result = this.countStmt.get() as { count: number };
      if (result.count > this.config.maxSavedMessages) {
        const deleted = this.cleanupStmt.run(this.config.maxSavedMessages);
        if (deleted.changes > 0) {
          console.log(`[LogDB] Cleaned up ${deleted.changes} old log entries`);
        }
      }
    } catch (error) {
      console.error("[LogDB] Failed to cleanup:", error);
    }
  }

  queryLogs(limit = 100, offset = 0) {
    if (!this.db) {
      return [];
    }

    return this.db
      .prepare(
        `
      SELECT * FROM request_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(limit, offset);
  }

  getStats() {
    if (!this.db) {
      return null;
    }

    return this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN response_status >= 200 AND response_status < 300 THEN 1 END) as success,
        COUNT(CASE WHEN response_status >= 400 THEN 1 END) as errors,
        COUNT(CASE WHEN fallback_triggered = 1 THEN 1 END) as fallbacks,
        AVG(duration_ms) as avg_duration
      FROM request_logs
    `
      )
      .get();
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const logDb = new LogDatabase();
