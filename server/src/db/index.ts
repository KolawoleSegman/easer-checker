import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

// Use a path that will be persisted on Render (mount point: /app)
// The 'data' folder will be created automatically if it doesn't exist.
const sqlite = new Database('data/easer_checker.db');

export const db = drizzle(sqlite, { schema });
