// Puts a backup made by `npm run backup` back into the database. ONLY use this if something went wrong:
// each collection that has a file in the folder is REPLACED by the file's contents.
//   npm run restore -- backups/<date-time>            (shows what it would do, changes nothing)
//   npm run restore -- backups/<date-time> --apply    (really restores)
import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");
const folder = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!folder || !existsSync(folder)) {
  console.error("Give the backup folder, e.g.  npm run restore -- backups/2026-11-20T10-00-00");
  process.exit(1);
}
const { EJSON } = mongoose.mongo.BSON;
await mongoose.connect(process.env.MONGODB_URI);
try {
  const db = mongoose.connection.db;
  console.log(`Database "${db.databaseName}"${apply ? "" : "  (dry run: nothing is changed)"}`);
  for (const file of readdirSync(folder).filter((f) => f.endsWith(".json"))) {
    const name = file.replace(/\.json$/, "");
    const docs = EJSON.parse(readFileSync(path.join(folder, file), "utf8"));
    const now = await db.collection(name).countDocuments();
    console.log(`${name.padEnd(16)} now ${String(now).padStart(5)} documents  ->  ${String(docs.length).padStart(5)} from backup`);
    if (apply) {
      await db.collection(name).deleteMany({});
      if (docs.length) await db.collection(name).insertMany(docs);
    }
  }
  console.log(apply ? "\nRestored." : "\nRun again with --apply to restore.");
} finally {
  await mongoose.disconnect();
}
