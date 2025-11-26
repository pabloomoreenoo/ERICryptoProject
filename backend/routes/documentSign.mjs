import express from 'express'
import mongoose from 'mongoose'
import Documento from '../models/Documento.mjs'

const router = express.Router()

// 🔧 Añade esto al inicio del archivo
// normaliza hashes: minúsculas y sin '0x'
const norm = (h) => String(h || '').trim().toLowerCase().replace(/^0x/, '')

// helper para estado
function computeStatus(firmasRealizadas, firmasTotales) {
  if (!firmasTotales || firmasTotales <= 0) return 'Sin firmar'
  if (firmasRealizadas <= 0) return 'Sin firmar'
  if (firmasRealizadas < firmasTotales) return 'Parcialmente firmado'
  return 'Firmado'
}

router.post('/:id/sign', async (req, res) => {
   try {
    const {
      correo,
      nombreCompleto,
      direccionCartera,
      decision,
      firmaDigital = null,
      hashDocumento,
      hashTransaccion = null,
      certificadoPublico,
      ipFirma = null,
      ubicacion = null,
      userAgent = null,
    } = req.body || {}

    // --- Validaciones básicas ---
    if (!correo || !nombreCompleto || !direccionCartera || !decision || !hashDocumento) {
      return res.status(400).json({ ok: false, error: 'missing_fields' })
    }

    const decisionLc = String(decision).toLowerCase()
    if (!['aceptada', 'rechazada'].includes(decisionLc)) {
      return res.status(400).json({ ok: false, error: 'invalid_decision' })
    }

    // --- Buscar documento ---
    const docId = req.params.id
    const doc = await Documento.findById(docId)
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'doc_not_found' })
    }

    // Si el documento ya está marcado como completamente firmado, no permitir más acciones
    if (doc.status === 'Firmado') {
      return res.status(409).json({ ok: false, error: 'already_completed' })
    }

    // --- Comprobar si este wallet ya ha tomado decisión (aceptar o rechazar) ---
    const addrLc = String(direccionCartera).toLowerCase().trim()
    const yaDecidido = (doc.firmas || []).some(
      f => String(f.direccionCartera || '').toLowerCase().trim() === addrLc,
    )

    if (yaDecidido) {
      return res.status(409).json({ ok: false, error: 'already_decided' })
    }

    // --- Construir entrada de firma/decisión ---
    const firmaEntry = {
      correo,
      nombreCompleto,
      direccionCartera,
      fechaFirma: new Date(),
      firmaDigital: firmaDigital, // para rechazada puede ser null
      hashDocumento: hashDocumento, // requerido según tu firmaSchema
      hashTransaccion: hashTransaccion, // tx del recordSignature o recordRejection
      certificadoPublico: certificadoPublico || direccionCartera,
      ipFirma,
      ubicacion,
      userAgent,
      selloTiempo: new Date(),
      decision: decisionLc,
    }

    doc.firmas.push(firmaEntry)

    // --- Actualizar contadores y estado ---
    if (decisionLc === 'aceptada') {
      // sumamos una firma válida
      doc.firmasRealizadas = (doc.firmasRealizadas || 0) + 1

      if (doc.firmasRealizadas >= doc.firmasTotales) {
        doc.status = 'Firmado'
      } else {
        doc.status = 'Parcialmente firmado'
      }
    } else {
      // decision == 'rechazada'
      // no sumamos firmasRealizadas, pero el doc puede seguir "Parcialmente firmado"
      const hayAceptadas = doc.firmas.some(f => f.decision === 'aceptada')
      doc.status = hayAceptadas ? 'Parcialmente firmado' : 'Sin firmar'
    }

    await doc.save()

    return res.json({
      ok: true,
      docId: String(doc._id),
      status: doc.status,
      firmasRealizadas: doc.firmasRealizadas,
      firmasTotales: doc.firmasTotales,
    })
  } catch (e) {
    console.error('POST /api/docs/:id/sign error:', e)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

export default router

