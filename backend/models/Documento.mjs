// backend/models/Documento.mjs
import mongoose from 'mongoose'

const firmaSchema = new mongoose.Schema({
  correo: { type: String, required: true }, //Del firmante
  nombreCompleto: { type: String, required: true },
  direccionCartera: { type: String, required: true },
  fechaFirma: { type: Date, default: Date.now },
  firmaDigital: { type: String, default : null }, // resultado de firma con MetaMask, null si se rechaza la firma
  hashDocumento: { type: String, required: true }, // hash del documento firmado
  hashTransaccion: { type: String, default: null }, // hash de la transacción en blockchain
  certificadoPublico: { type: String, required: true }, // clave pública del firmante
  ipFirma: { type: String, default: null }, //dirección IP desde donde se realizó la firma
  ubicacion: { type: String, default: null }, //ubicación geográfica 
  userAgent: { type: String, default: null }, //información del navegador
  selloTiempo: { type: Date, default: Date.now }, //marca de tiempo de la firma
  decision: { 
    type: String, 
    enum: ["aceptada", "rechazada"], 
    required: true 
  }
});

const documentoSchema = new mongoose.Schema({
  nombre: { type: String, required: true }, //Del documento
  hash: { type: String, required: true, unique: true },
  archivo: { type: Buffer, required: true }, //Contenido binario del archivo
  fechaSubida: { type: Date, default: Date.now }, //Fecha de subida del documento 
  firmas: { type: [firmaSchema], default: [] }, //Array de firmas
  firmasRealizadas: { type: Number, default: 0 }, 
  firmasTotales: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ["Sin firmar", "Parcialmente firmado", "Firmado"], 
    default: "Sin firmar" 
  }, //Estado del documento
  historialVersiones: { type: [String], default: [] },
  verificacionIntegridad: { type: Boolean, default: true } //Indica se el documento ha pasado la verificacion de integridad tras las firmas
}, { timestamps: true })

export default mongoose.models.Documento || mongoose.model('Documento', documentoSchema)
