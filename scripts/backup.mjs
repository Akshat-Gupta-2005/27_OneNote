// Consistent snapshot of the notes database, safe while the server is running.
// Copying data/notes.db by itself is NOT a backup: in WAL mode recent writes (and on a
// small database, everything) live in notes.db-wal until a checkpoint. See docs/4_decisions.md P8.
//
// Usage: npm run backup [-- <output-dir>]     (default output dir: ./backups)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const source = path.join(dataDir, 'notes.db');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'backups'));

if (!fs.existsSync(source)) {
  console.error(`No database at ${source}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const target = path.join(outDir, `notes-${stamp}.db`);

const db = new DatabaseSync(source, { readOnly: true });
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

const check = new DatabaseSync(target, { readOnly: true });
const pages = check.prepare('SELECT COUNT(*) AS n FROM pages WHERE deleted_at IS NULL').get().n;
check.close();
console.log(`Wrote ${target} (${fs.statSync(target).size} bytes, ${pages} pages).`);
console.log(`Uploaded files are not inside the database. Copy ${path.join(dataDir, 'uploads')} as well.`);
