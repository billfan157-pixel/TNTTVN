declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => SqlJsDatabase
  }
  interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): void
    exec(sql: string): SqlJsResult[]
    export(): Uint8Array
    prepare(sql: string): SqlJsStatement
  }
  interface SqlJsResult {
    columns: string[]
    values: unknown[][]
  }
  interface SqlJsStatement {
    run(...args: unknown[]): void
    step(): boolean
    bind(...args: unknown[]): boolean
    getAsObject(): Record<string, unknown>
    free(): boolean
  }
  export default function initSqlJs(): Promise<SqlJsStatic>
}
