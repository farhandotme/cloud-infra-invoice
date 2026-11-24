// One-off: correct the dates of invoices that were generated in advance and are STILL locked (Scheduled).
//   npm run fix-dates            -> only LISTS what would change (nothing is written)
//   npm run fix-dates -- --apply -> writes the change
//
// Rule: invoice date = due date = the day the invoice unlocks (1st of the next month), e.g. November -> 01 Dec 2026.
// Only invoices that still have the earlier automatic dates (1st of own month / due +15, or unlock date / due +15) are touched. Dates edited by hand, released invoices, Paid
// invoices and past-month invoices are never changed. (Invoices that unlock later are also corrected automatically
// at the moment they unlock, so this script is optional: it just makes the dates right in the lists today.)
import "dotenv/config";
import mongoose from "mongoose";
import Record from "../src/models/Record.js";
import {
  currentMonthKey,
  hasAutoDates,
  scheduledDates,
  unlockDate,
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
  const todo = locked.filter((r) => hasAutoDates(r.data));
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

  // Already-released invoices (Pending / Paid / ...) of past months: issue date was the 1st of their own month
  // (e.g. 01 Oct for October). It must be the 1st of the NEXT month (01 Nov); due date = issue date.
  const released = await Record.find({
    type: "invoices",
    "data.generated": true,
    "data.status": { $ne: "Scheduled" },
  }).lean();
  const past = released.filter((r) => {
    const m = r.data.periodMonth;
    if (!m) return false;
    // Old pattern (issue = 1st of own month, due +15) or the intermediate one (issue = unlock date, due +15).
    return hasAutoDates(r.data);
  });
  console.log(`\n${past.length} released invoice(s) still have the old dates.`);
  for (const r of past) {
    const issueDate = unlockDate(r.data.periodMonth);
    const dueDate = issueDate; // due date = issue date
    console.log(
      `${r.data.number}  ${r.data.periodMonth}  ${r.data.status}\n   invoice date ${r.data.issueDate} -> ${issueDate}   due ${r.data.dueDate} -> ${dueDate}`,
    );
    if (apply)
      await Record.updateOne(
        { _id: r._id },
        { $set: { "data.issueDate": issueDate, "data.dueDate": dueDate } },
      );
  }
  if (apply) console.log(`Updated ${past.length} released invoice(s).`);

  if ((todo.length || past.length) && !apply) console.log("\nRun again with --apply to write these changes.");
  if (apply) console.log(`\nUpdated ${todo.length} invoice(s).`);
} finally {
  await mongoose.disconnect();
}
