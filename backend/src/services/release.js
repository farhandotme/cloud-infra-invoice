import Record from "../models/Record.js";
import { currentMonthKey } from "./billing.js";

/** Scheduled invoices whose month has ended become normal Pending invoices. */
export async function releaseDueInvoices() {
  await Record.updateMany(
    {
      type: "invoices",
      "data.status": "Scheduled",
      "data.periodMonth": { $lt: currentMonthKey() },
    },
    { $set: { "data.status": "Pending" } },
  );
}
