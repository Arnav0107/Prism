/**
 * Structured Deterministic Logger for Prism Keeper
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export class KeeperLogger {
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  public info(message: string, meta?: Record<string, unknown>) {
    this.log('INFO', message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>) {
    this.log('WARN', message, meta);
  }

  public error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errObj = error instanceof Error ? { error: error.message, stack: error.stack } : { error };
    this.log('ERROR', message, { ...meta, ...errObj });
  }

  public success(message: string, meta?: Record<string, unknown>) {
    this.log('SUCCESS', message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const ts = this.formatTimestamp();
    const metaStr = meta && Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    console.log(`[${ts}] [${level.padEnd(7)}] ${message}${metaStr}`);
  }
}

export const logger = new KeeperLogger();
