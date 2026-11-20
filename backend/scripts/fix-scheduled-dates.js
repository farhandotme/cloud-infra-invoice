// One-off: correct the dates of invoices that were generated in advance and are STILL locked (Scheduled).
//   npm run fix-dates            -> only LISTS what would change (nothing is written)
//   npm run fix-dates -- --apply -> writes the change
//
// Old rule: invoice date = 1st of the billing month, due = 15 days later (already past on the day the invoice unlocks).
// New rule: invoice date = day it unlocks (1st of the next month), due = 15 days after that.
// Only invoices that still have the old automatic dates are touched. Dates edited by hand, released invoices, Paid
// invoices and past-month invoices are never changed. (Invoices that unlock later are also corrected automatically
// at the moment they unlock, so this script is optional: it just makes the dates right in the lists today.)
import "dotenv/config";
import mongoose from "mongoose";
import Record from "../src/models/Record.js";
import {
  currentMonthKey,
  hasLegacyDates,
  scheduledDates,
} from "../src/services/billing.js";

const apply = process.argv.includes("--apply");
await mongoose.connect(process.env.MONGODB_URI);
try {
  const locked = await Record.find({
    type: "invoices",
    "data.generated": true,
    "data.status": "Scheduled",
    "data.periodMonth": { $gte: currentMonthKey() },
  }).lean();
  const todo = locked.filter((r) => hasLegacyDates(r.data));
  console.log(
    `${locked.length} locked invoice(s); ${todo.length} still have the old dates.${apply ? "" : "  (dry run: nothing written)"}\n`,
  );
  for (const r of todo) {
    const next = scheduledDates(r.data.periodMonth);
    console.log(
      `${r.data.number}  ${r.data.clientName ?? ""}  ${r.data.periodMonth}\n   invoice date ${r.data.issueDate} -> ${next.issueDate}   due ${r.data.dueDate} -> ${next.dueDate}`,
    );
    if (apply)
      await Record.updateOne(
        { _id: r._id, "data.status": "Scheduled" },
        { $set: { "data.issueDate": next.issueDate, "data.dueDate": next.dueDate } },
      );
  }
  if (todo.length && !apply) console.log("\nRun again with --apply to write these changes.");
  if (apply) console.log(`\nUpdated ${todo.length} invoice(s).`);
} finally {
  await mongoose.disconnect();
}
