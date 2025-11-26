// backend/routes/emailOtp.mjs
import express from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

import sgMail from '../lib/sendgrid.mjs'
import User from '../models/User.mjs'
import EmailOtp from '../models/EmailOtp.mjs'

const router = express.Router()

const EMAIL_FROM = (process.env.EMAIL_FROM || '').trim()
const OTP_CODE_LENGTH = Number(process.env.OTP_CODE_LENGTH || 6)
const OTP_EXPIRES_MIN = Number(process.env.OTP_EXPIRES_MIN || 10)
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5)
const JWT_SESSION_SECRET = (process.env.JWT_SESSION_SECRET || '').trim()

function genOtp(len) {
  const min = 10 ** (len - 1)
  const max = 10 ** len - 1
  // randomInt es exclusivo por arriba; si quieres incluir max, usa (max + 1)
  return String(crypto.randomInt(min, max + 1))
}
function hashWithSalt(value, salt) {
  return crypto.createHash('sha256').update(value + salt).digest('hex')
}

/**
 * POST /api/email-otp/request
 * body: { correo, direccionCartera }
 * 1) Comprueba en Mongo que correo ↔ direccionCartera existen y coinciden
 * 2) Invalida OTP previos y crea uno nuevo
 * 3) Envía OTP por correo
 */
router.post('/request', async (req, res) => {
  try {
    const { correo, direccionCartera } = req.body || {}
    if (!correo || !direccionCartera) {
      return res.status(400).json({ ok: false, error: 'correo and direccionCartera required' })
    }
    if (!EMAIL_FROM) {
      return res.status(500).json({ ok: false, error: 'EMAIL_FROM not configured' })
    }

    const correoLc = String(correo).toLowerCase().trim()
    const carteraLc = String(direccionCartera).toLowerCase().trim()

    const user = await User.findOne({ correo: correoLc, direccionCartera: carteraLc })
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user_not_found_or_mismatch' })
    }

    // Invalida OTPs previos no usados para esta pareja correo/cartera
    await EmailOtp.updateMany(
      { correo: correoLc, direccionCartera: carteraLc, used: false },
      { $set: { used: true } }
    )

    // Genera OTP
    const code = genOtp(OTP_CODE_LENGTH)
    const salt = crypto.randomBytes(16).toString('hex')
    const codeHash = hashWithSalt(code, salt)
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000)

    await EmailOtp.create({
      correo: correoLc,
      direccionCartera: carteraLc,
      codeHash,
      salt,
      expiresAt,
    })

    // Envía correo
    await sgMail.send({
      to: correoLc,
      from: EMAIL_FROM,
      subject: 'Tu código de verificación',
      html: `
        <p>Tu código de verificación es:</p>
        <p style="font-size:24px;letter-spacing:3px;"><b>${code}</b></p>
        <p>Caduca en ${OTP_EXPIRES_MIN} minutos.</p>
      `
    })

    return res.json({ ok: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

/**
 * POST /api/email-otp/verify
 * body: { correo, direccionCartera, code }
 * - Valida OTP, controla intentos, marca usado y devuelve tokenSesion (JWT)
 */
router.post('/verify', async (req, res) => {
  try {
    const { correo, direccionCartera, code } = req.body || {}
    if (!correo || !direccionCartera || !code) {
      return res.status(400).json({ ok: false, error: 'correo, direccionCartera, code required' })
    }
    if (!JWT_SESSION_SECRET) {
      return res.status(500).json({ ok: false, error: 'JWT_SESSION_SECRET not configured' })
    }

    const correoLc = String(correo).toLowerCase().trim()
    const carteraLc = String(direccionCartera).toLowerCase().trim()

    const otp = await EmailOtp.findOne({
      correo: correoLc,
      direccionCartera: carteraLc,
      used: false,
    }).sort({ createdAt: -1 })

    if (!otp) return res.status(400).json({ ok: false, error: 'no_active_code' })
    if (otp.expiresAt.getTime() < Date.now()) return res.status(400).json({ ok: false, error: 'expired' })
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return res.status(429).json({ ok: false, error: 'too_many_attempts' })

    const computed = hashWithSalt(String(code), otp.salt)
    const match = crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(otp.codeHash))
    if (!match) {
      otp.attempts += 1
      await otp.save()
      return res.status(401).json({ ok: false, error: 'invalid_code' })
    }

    otp.used = true
    await otp.save()

    // Crea JWT de sesión
    const tokenSesion = jwt.sign(
      { correo: correoLc, direccionCartera: carteraLc },
      JWT_SESSION_SECRET,
      { expiresIn: '7d' }
    )

    return res.json({ ok: true, tokenSesion })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

export default router
