import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  correo: { type: String, required: true, index: true, lowercase: true, trim: true },
  direccionCartera: { type: String, required: true, index: true, lowercase: true, trim: true },
}, { timestamps: true })

userSchema.index({ correo: 1, direccionCartera: 1 }, { unique: true })

export default mongoose.model('User', userSchema)
