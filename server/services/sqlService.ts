import { supabase } from '../lib/supabase';

export class SqlService {
  async executeSql(sql: string): Promise<any> {
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        query: sql
      });

      if (error) {
        console.error('SQL execution error:', error);
        throw new Error(`SQL execution failed: ${error.message}`);
      }

      return data;
    } catch (err: any) {
      console.error('SQL service error:', err);
      throw err;
    }
  }

  async executeMultipleSql(queries: string[]): Promise<any[]> {
    const results = [];
    for (const query of queries) {
      const result = await this.executeSql(query);
      results.push(result);
    }
    return results;
  }

  async getTablesList(): Promise<string[]> {
    const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    
    const data = await this.executeSql(sql);
    
    // La fonction RPC retourne un JSON array ou un objet avec error
    if (data?.error) {
      throw new Error(`SQL error: ${data.error} (${data.detail})`);
    }
    
    if (Array.isArray(data)) {
      return data.map((row: any) => row.table_name);
    }
    
    return [];
  }

  async getTableStructure(tableName: string): Promise<any> {
    const sql = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position`;
    
    const data = await this.executeSql(sql);
    
    if (data?.error) {
      throw new Error(`SQL error: ${data.error} (${data.detail})`);
    }
    
    return data;
  }
}

export const sqlService = new SqlService();
