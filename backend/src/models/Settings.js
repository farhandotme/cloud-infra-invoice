import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'main' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, minimize: false });

export default mongoose.model('Settings', settingsSchema);
