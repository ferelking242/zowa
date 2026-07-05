import { query } from '../lib/db';

export class SqlService {
  async executeSql(sql: string): Promise<any> {
    try {
      const rows = await query(sql);
      return rows;
    } catch (err: any) {
      console.error('SQL service error:', err);
      throw err;
    }
  }

  async executeMultipleSql(queries: string[]): Promise<any[]> {
    const results = [];
    for (const q of queries) {
      results.push(await this.executeSql(q));
    }
    return results;
  }

  async getTablesList(): Promise<string[]> {
    const rows = await query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    return rows.map((r: any) => r.table_name);
  }

  async getTableStructure(tableName: string): Promise<any> {
    return query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );
  }
}

export const sqlService = new SqlService();
