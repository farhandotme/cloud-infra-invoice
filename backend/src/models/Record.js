import mongoose from 'mongoose';

const recordSchema = new mongoose.Schema({
  type: { type: String, required: true, index: true, trim: true },
  title: { type: String, required: true, trim: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });

export default mongoose.model('Record', recordSchema);
