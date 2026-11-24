// Saves EVERY collection of the database in backend/.env (MONGODB_URI) to a folder of files, using the app's own
// connection. Nothing is changed in the database.
//   npm run backup
// Writes backend/backups/<date-time>/<collection>.json (exact copy: ids and dates are preserved).
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const { EJSON } = mongoose.mongo.BSON;
await mongoose.connect(process.env.MONGODB_URI);
try {
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.resolve("backups", stamp);
  mkdirSync(dir, { recursive: true });
  const collections = (await db.listCollections().toArray()).filter((c) => !c.name.startsWith("system."));
  let total = 0;
  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(docs, { relaxed: false }, 2));
    console.log(`${name.padEnd(16)} ${String(docs.length).padStart(6)} documents`);
    total += docs.length;
  }
  console.log(`\nBackup of database "${db.databaseName}" saved: ${dir}\n${total} documents in ${collections.length} collections.`);
} finally {
  await mongoose.disconnect();
}
