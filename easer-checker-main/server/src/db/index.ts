import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import fs from 'fs';
import { DATA_DIR, DB_PATH } from '../common/data-dir';

try {
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`📁 Creating database directory: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  console.log(`📂 Database path: ${DB_PATH}`);
} catch (err) {
  console.error('❌ Failed to create database directory:', err);
  process.exit(1);
}

const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite, { schema });
