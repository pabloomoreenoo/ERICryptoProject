import mongoose from 'mongoose'

const emailOtpSchema = new mongoose.Schema({
  correo: { type: String, required: true, lowercase: true, trim: true, index: true },
  direccionCartera: { type: String, required: true, lowercase: true, trim: true, index: true },
  codeHash: { type: String, required: true },
  salt: { type: String, required: true },
  used: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true })

export default mongoose.model('EmailOtp', emailOtpSchema)
