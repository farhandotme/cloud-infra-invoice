import Record from "../models/Record.js";
import {
  currentMonthKey,
  hasLegacyDates,
  scheduledDates,
} from "./billing.js";

/**
 * Scheduled invoices whose month has ended become normal Pending invoices.
 * An invoice that still has the dates older versions gave it (issued on the 1st of its own month, so already past due
 * the day it unlocks) gets the issue date = unlock date and due date = 15 days later. Dates changed by hand are kept.
 * Safe to run on every request: each invoice is only changed while it is still "Scheduled".
 */
export async function releaseDueInvoices() {
  const due = await Record.find({
    type: "invoices",
    "data.status": "Scheduled",
    "data.periodMonth": { $lt: currentMonthKey() },
  })
    .select("data.periodMonth data.issueDate data.dueDate")
    .lean();
  for (const invoice of due) {
    const set = { "data.status": "Pending" };
    if (hasLegacyDates(invoice.data)) {
      const dates = scheduledDates(invoice.data.periodMonth);
      set["data.issueDate"] = dates.issueDate;
      set["data.dueDate"] = dates.dueDate;
    }
    await Record.updateOne(
      { _id: invoice._id, "data.status": "Scheduled" },
      { $set: set },
    );
  }
}
