// ===============================
//  backend/server.mjs
// ===============================

import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import sgMail from '@sendgrid/mail'

// Vars
dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

console.log('URI leída del .env:', process.env.MONGODB_URI)

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error al conectar con MongoDB Atlas:', err))

// ===== Usuario (tal cual lo tenías)
const usuarioSchema = new mongoose.Schema({
  correo: { type: String, required: true, unique: true },
  direccionCartera: { type: String, required: true },
  fechaRegistro: { type: Date, default: Date.now }
})
const Usuario = mongoose.model('Usuario', usuarioSchema)

// ===== Email OTP (tal cual lo tenías)
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const EMAIL_FROM         = (process.env.EMAIL_FROM || '').trim()
const OTP_CODE_LENGTH    = Number(process.env.OTP_CODE_LENGTH || 6)
const OTP_EXPIRES_MIN    = Number(process.env.OTP_EXPIRES_MIN || 10)
const OTP_MAX_ATTEMPTS   = Number(process.env.OTP_MAX_ATTEMPTS || 5)
const JWT_SESSION_SECRET = (process.env.JWT_SESSION_SECRET || '').trim()

const emailOtpSchema = new mongoose.Schema({
  correo: { type: String, required: true, lowercase: true, trim: true, index: true },
  direccionCartera: { type: String, required: true, lowercase: true, trim: true, index: true },
  codeHash: { type: String, required: true },
  salt: { type: String, required: true },
  used: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true })
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
const EmailOtp = mongoose.models.EmailOtp || mongoose.model('EmailOtp', emailOtpSchema)

// ✅ IMPORTA el modelo Documento (REGISTRA SCHEMA AQUÍ)
import Documento from './models/Documento.mjs'

// ✅ Importa y usa el router de firma
import documentSignRouter from './routes/documentSign.mjs'
app.use('/api/docs', documentSignRouter)

// Helpers OTP
function genOtp(len) {
  const min = 10 ** (len - 1)
  const max = 10 ** len - 1
  return String(crypto.randomInt(min, max + 1))
}
function hashWithSalt(value, salt) {
  return crypto.createHash('sha256').update(value + salt).digest('hex')
}

// ===== EMAIL CHECK
app.post('/api/email-check', async (req, res) => {
  try {
    const { correo, direccionCartera } = req.body || {}
    if (!correo || !direccionCartera) {
      return res.status(400).json({ ok: false, error: 'correo and direccionCartera required' })
    }
    const correoLc = String(correo).toLowerCase().trim()
    const carteraLc = String(direccionCartera).toLowerCase().trim()

    const user = await Usuario.findOne({ correo: correoLc })
    if (!user) return res.json({ ok: true, found: false, match: false })

    const expected = String(user.direccionCartera || '').toLowerCase().trim()
    const match = expected === carteraLc
    return res.json({ ok: true, found: true, match, expectedWallet: expected })
  } catch (e) {
    console.error('email-check error:', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

// ===== OTP REQUEST
app.post('/api/email-otp/request', async (req, res) => {
  try {
    const { correo, direccionCartera } = req.body || {}
    if (!correo || !direccionCartera) {
      return res.status(400).json({ ok: false, error: 'correo and direccionCartera required' })
    }
    if (!EMAIL_FROM || !process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ ok: false, error: 'email_sender_not_configured' })
    }

    const correoLc  = String(correo).toLowerCase().trim()
    const carteraLc = String(direccionCartera).toLowerCase().trim()

    const user = await Usuario.findOne({ correo: correoLc })
    if (!user) return res.status(404).json({ ok: false, error: 'user_not_found_or_mismatch' })
    const expected = String(user.direccionCartera || '').toLowerCase().trim()
    if (expected !== carteraLc) return res.status(404).json({ ok: false, error: 'user_not_found_or_mismatch' })

    await EmailOtp.updateMany({ correo: correoLc, direccionCartera: carteraLc, used: false }, { $set: { used: true } })

    const code = genOtp(OTP_CODE_LENGTH)
    const salt = crypto.randomBytes(16).toString('hex')
    const codeHash = hashWithSalt(code, salt)
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000)

    await EmailOtp.create({ correo: correoLc, direccionCartera: carteraLc, codeHash, salt, expiresAt })

    const html = `
      <p>Tu código de verificación es:</p>
      <p style="font-size:24px;letter-spacing:3px;"><b>${code}</b></p>
      <p>Caduca en ${OTP_EXPIRES_MIN} minutos.</p>
    `
    await sgMail.send({ to: correoLc, from: EMAIL_FROM, subject: 'Código de verificación', html })
    console.log(`[DEV] OTP enviado a ${correoLc}: ${code}`)
    return res.json({ ok: true })
  } catch (e) {
    console.error('email-otp/request error:', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

// ===== OTP VERIFY
app.post('/api/email-otp/verify', async (req, res) => {
  try {
    const { correo, direccionCartera, code } = req.body || {}
    if (!correo || !direccionCartera || !code) {
      return res.status(400).json({ ok: false, error: 'correo, direccionCartera, code required' })
    }
    if (!JWT_SESSION_SECRET) {
      return res.status(500).json({ ok: false, error: 'JWT_SESSION_SECRET not configured' })
    }

    const correoLc  = String(correo).toLowerCase().trim()
    const carteraLc = String(direccionCartera).toLowerCase().trim()

    const otp = await EmailOtp.findOne({ correo: correoLc, direccionCartera: carteraLc, used: false }).sort({ createdAt: -1 })
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

    const tokenSesion = jwt.sign(
      { correo: correoLc, direccionCartera: carteraLc },
      JWT_SESSION_SECRET,
      { expiresIn: '30m' }
    )

    return res.json({ ok: true, tokenSesion })
  } catch (e) {
    console.error('email-otp/verify error:', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

// ===== Registro de usuarios (igual que antes)
app.post('/api/register', async (req, res) => {
  const { correo, direccionCartera } = req.body
  const nuevoUsuario = new Usuario({ correo, direccionCartera })
  try {
    await nuevoUsuario.save()
    res.status(201).json({ mensaje: 'Usuario registrado correctamente' })
  } catch (error) {
    res.status(400).json({ error: 'Error al registrar usuario', detalles: error })
  }
})

// ===== Validar sesión por JWT =====
// GET /api/session/validate  (Authorization: Bearer <token>)
app.get('/api/session/validate', (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return res.status(401).json({ ok: false, error: 'no_token' })

    const payload = jwt.verify(token, JWT_SESSION_SECRET) // lanza si expira
    const now = Math.floor(Date.now() / 1000)
    const msLeft = Math.max(0, (payload.exp - now) * 1000)

    return res.json({
      ok: true,
      correo: payload.correo,
      direccionCartera: payload.direccionCartera,
      exp: payload.exp,
      msLeft,
    })
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid_or_expired' })
  }
})


// ===== Listar PDFs (solo metadatos) =====
// GET /api/docs?wallet=0xabc...
app.get('/api/docs', async (req, res) => {
  try {
    const walletLc = String(req.query.wallet || '').toLowerCase().trim();

    // Trae solo lo que necesitamos (NO el binario)
    const docsRaw = await mongoose.connection.db
      .collection('documentos')
      .find({})
      .project({
        nombre: 1,
        fechaSubida: 1,
        status: 1,
        'firmas.direccionCartera': 1,
        'firmas.decision': 1,
      })
      .sort({ fechaSubida: -1 })
      .toArray();

    const docs = docsRaw.map((d) => {
      let signedByMe = false;
      let rejectedByMe = false;

      if (walletLc && Array.isArray(d.firmas)) {
        for (const f of d.firmas) {
          const addr = String(f?.direccionCartera || '').toLowerCase().trim();
          if (addr === walletLc) {
            if (String(f?.decision).toLowerCase() === 'aceptada') signedByMe = true;
            if (String(f?.decision).toLowerCase() === 'rechazada') rejectedByMe = true;
          }
          if (signedByMe && rejectedByMe) break;
        }
      }

      return {
        id: String(d._id),
        title: d.nombre,
        status: d.status || '',
        uploadedAt: d.fechaSubida,
        signedByMe,
        rejectedByMe, // <-- NUEVO
      };
    });

    res.json({ ok: true, docs });
  } catch (e) {
    console.error('list docs error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});


// GET /api/docs/:id/view
app.get('/api/docs/:id/view', async (req, res) => {
  try {
    const doc = await Documento.findById(req.params.id).select('nombre archivo') // <- sin .lean() (más simple)
    if (!doc || !doc.archivo) return res.status(404).send('Documento no encontrado')

    const data = Buffer.isBuffer(doc.archivo) ? doc.archivo
                : (doc.archivo && doc.archivo.buffer) ? doc.archivo.buffer
                : null
    if (!data) return res.status(500).send('Documento corrupto')

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${(doc.nombre || 'documento')}.pdf"`,
      'Cache-Control': 'no-store',
    })
    res.end(data)
  } catch (e) {
    console.error('view doc error:', e)
    res.status(400).send('Solicitud inválida')
  }
})

// GET /api/docs/:id/download
app.get('/api/docs/:id/download', async (req, res) => {
  try {
    const doc = await Documento.findById(req.params.id).select('nombre archivo') // <- sin .lean()
    if (!doc || !doc.archivo) return res.status(404).send('Documento no encontrado')

    const data = Buffer.isBuffer(doc.archivo) ? doc.archivo
                : (doc.archivo && doc.archivo.buffer) ? doc.archivo.buffer
                : null
    if (!data) return res.status(500).send('Documento corrupto')

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${(doc.nombre || 'documento')}.pdf"`,
    })
    res.end(data)
  } catch (e) {
    console.error('download doc error:', e)
    res.status(400).send('Solicitud inválida')
  }
})



// GET /api/docs/:id/meta  -> devuelve hash del doc
app.get('/api/docs/:id/meta', async (req, res) => {
  try {
    const doc = await Documento.findById(req.params.id).select('hash').lean()
    if (!doc) return res.status(404).json({ ok: false, error: 'doc_not_found' })
    res.json({ ok: true, hash: doc.hash })
  } catch (e) {
    console.error('meta doc error:', e)
    res.status(400).json({ ok: false, error: 'bad_request' })
  }
})

// Start server
app.listen(5000, () => console.log('🚀 Servidor ejecutándose en http://localhost:5000'))
