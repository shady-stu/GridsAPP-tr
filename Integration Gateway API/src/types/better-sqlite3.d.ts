declare module "better-sqlite3" {
  class Database {
    constructor(path: string);
    readonly open: boolean;
    pragma(source: string): unknown;
    exec(source: string): this;
    prepare(source: string): Statement;
    transaction<T extends (...args: never[]) => unknown>(callback: T): T;
    close(): void;
  }
  interface Statement {
    all(...parameters: unknown[]): unknown[];
    get(...parameters: unknown[]): unknown;
    run(...parameters: unknown[]): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
  }
  export = Database;
}
