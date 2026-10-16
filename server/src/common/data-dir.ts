import { join, resolve } from 'path';

/**
 * Centralizes where persistent data (SQLite DB + uploaded avatars) lives.
 *
 * On Render (or any host with an ephemeral filesystem), set the DATA_DIR
 * env var to wherever your persistent disk is mounted — see render.yaml,
 * which mounts a disk at /var/data and sets DATA_DIR accordingly. Without
 * a persistent disk, everything under DATA_DIR is wiped on every deploy
 * and every restart.
 *
 * Locally (no DATA_DIR set), this defaults to <repo>/server/data so
 * `npm run start:dev` works out of the box.
 */
export const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(process.cwd(), 'data');

export const UPLOADS_DIR = join(DATA_DIR, 'uploads');
export const DB_PATH = join(DATA_DIR, 'easer_checker.db');
