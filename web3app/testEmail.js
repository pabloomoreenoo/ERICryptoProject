// testEmail.js
import dotenv from 'dotenv'
dotenv.config()
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const msg = {
  to: 'pablomoregar15@gmail.com', // <-- tu correo real
  from: process.env.EMAIL_FROM, // <-- el que verificaste
  subject: '🧪 Prueba de envío desde Web3App',
  text: '¡Hola! Este es un correo de prueba usando SendGrid.',
  html: '<strong>¡Hola! Este es un correo de prueba usando SendGrid.</strong>',
}

sgMail
  .send(msg)
  .then(() => {
    console.log('✅ Correo enviado correctamente!')
  })
  .catch((error) => {
    console.error('❌ Error al enviar correo:', error)
  })