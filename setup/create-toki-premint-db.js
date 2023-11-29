import Database from 'better-sqlite3';
import fs from 'fs';
import { MAX_WAL_SIZE, WAL_INTERVAL } from '../config/constants.js';

const db = new Database('./db/toki-premint.db');
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync('./setup/create-toki-premint-db.sql', 'utf8');
db.exec(schema);

db.close();