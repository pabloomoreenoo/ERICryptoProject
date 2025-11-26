import express from 'express'
import User from '../models/User.mjs' // usa tu modelo con { correo, direccionCartera }

const router = express.Router()

router.post('/email-check', async (req, res) => {
  try {
    const { correo, direccionCartera } = req.body || {}
    if (!correo || !direccionCartera) {
      return res.status(400).json({ ok: false, error: 'correo and direccionCartera required' })
    }
    const correoLc = String(correo).toLowerCase().trim()
    const carteraLc = String(direccionCartera).toLowerCase().trim()

    const user = await User.findOne({ correo: correoLc })
    if (!user) return res.json({ ok: true, found: false, match: false })

    const expected = (user.direccionCartera || '').toLowerCase()
    const match = expected === carteraLc

    return res.json({ ok: true, found: true, match, expectedWallet: expected })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

export default router


