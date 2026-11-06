import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    recordType: String,
    recordId: String,
    title: String,
    actor: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, minimize: false },
);

auditLogSchema.index({ createdAt: -1 });
export default mongoose.model("AuditLog", auditLogSchema);
