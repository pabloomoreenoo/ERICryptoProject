import 'dotenv/config' // garantiza .env cargado al importar este módulo
import sgMail from '@sendgrid/mail'

const key = (process.env.SENDGRID_API_KEY || '').trim()
if (!key.startsWith('SG.')) {
  console.error('❌ SENDGRID_API_KEY inválida o vacía')
}
sgMail.setApiKey(key)

export default sgMail
