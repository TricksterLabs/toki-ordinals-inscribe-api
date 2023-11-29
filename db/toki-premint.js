import path from 'path';
import Database from 'better-sqlite3';
import fs from 'fs';
import { MAX_WAL_SIZE, WAL_INTERVAL } from '../config/constants.js';

const dbPath = path.join(process.cwd(), 'db', 'toki-premint.db');
const db = new Database(dbPath);
// const db = new Database('toki-premint.db');
db.pragma('journal_mode = WAL');

export function startWalCheckpoint() {
  setInterval(() => {
    fs.stat('inscribe-toki.db-wal', (err, stat) => {
      if (err) {
        if (err.code !== 'ENOENT') throw err;
      } else if (stat.size > MAX_WAL_SIZE) {
        db.pragma('wal_checkpoint(RESTART)');
      }
    });
  }, WAL_INTERVAL).unref();
}

export default db;