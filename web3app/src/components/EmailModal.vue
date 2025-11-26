<template>
  <div>
    <button @click="onOpen" class="connect-btn">
      <template v-if="!account">Log-in email</template>
      <template v-else>
        <span v-if="step !== 'ok'">Verify Email to use the App</span>
        <span v-else>Verified ✅</span>
      </template>
    </button>

    <transition name="fade">
      <div v-if="visible" class="modal-backdrop" @click.self="close">
        <div class="modal">
          <button class="modal-close" @click="close">✕</button>
          <h3>Verifica tu correo</h3>

          <!-- Wallet no conectada -->
          <p v-if="!account" class="warning">Por favor conecta tu wallet primero.</p>

          <!-- Paso 1: solicitar código -->
          <div v-else-if="step === 'email'" class="form">
            <label>Correo electrónico</label>
            <input v-model="correo" type="email" placeholder="tucorreo@empresa.com" />
            <div class="actions">
              <button class="btn-send" :disabled="!canRequest || loading" @click="requestOtp">
                {{ loading ? 'Enviando…' : 'Enviar código de verificación' }}
              </button>
              <button class="btn-cancel" @click="close">Cerrar</button>
            </div>
            <p v-if="msg" class="msg">{{ msg }}</p>
            <p v-if="errorMsg" class="msg error">{{ errorMsg }}</p>
          </div>

          <!-- Paso 2: introducir código -->
          <div v-else-if="step === 'code'" class="form">
            <label>Introduce el código de 6 dígitos enviado a {{ correo }}</label>
            <input v-model="codigo" inputmode="numeric" maxlength="6" placeholder="123456" />
            <div class="actions">
              <button class="btn-send" :disabled="!canVerify || loading" @click="verifyOtp">
                {{ loading ? 'Verificando…' : 'Verificar' }}
              </button>
              <button class="btn-cancel" :disabled="loading" @click="requestOtp">Reenviar</button>
            </div>
            <p v-if="msg" class="msg">{{ msg }}</p>
            <p v-if="errorMsg" class="msg error">{{ errorMsg }}</p>
          </div>

          <!-- Paso 3: ok -->
          <div v-else-if="step === 'ok'">
            <p class="msg">Correo verificado ✅ — ya puedes usar la aplicación.</p>
            <div class="actions">
              <button class="btn-primary" @click="close">Cerrar</button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCryptoStore } from '~/stores/crypto'
import { useAuthStore } from '~/stores/auth'

const crypto = useCryptoStore()
const { account } = storeToRefs(crypto)
const auth = useAuthStore()

const visible = ref(false)
const step = ref<'email'|'code'|'ok'>('email')

const correo = ref('')
const codigo = ref('')

const loading = ref(false)
const msg = ref('')
const errorMsg = ref('')

const canRequest = computed(() => !!correo.value && !!account.value)
const canVerify  = computed(() => !!codigo.value && !!correo.value && !!account.value)

/** 🔌 API base: Nuxt runtimeConfig > Vite env > fallback */
let apiBaseFromNuxt: string | undefined
// @ts-ignore - en Nuxt existe useRuntimeConfig como global
if (typeof useRuntimeConfig === 'function') {
  // @ts-ignore
  apiBaseFromNuxt = useRuntimeConfig()?.public?.apiBase
}
// @ts-ignore - Vite env
const apiBaseFromVite = (import.meta as any)?.env?.VITE_API_BASE
const API_BASE: string = apiBaseFromNuxt || apiBaseFromVite || 'http://localhost:5000'

async function onOpen() {
  msg.value = ''
  errorMsg.value = ''
  if (!account.value) {
    try {
      await crypto.connectWallet()
      visible.value = true
    } catch (err) {
      console.error(err)
      msg.value = 'Error conectando la wallet'
      return
    }
  } else {
    visible.value = true
  }
  step.value = 'email'
  codigo.value = ''
}

function close() {
  visible.value = false
  correo.value = ''
  codigo.value = ''
  msg.value = ''
  errorMsg.value = ''
  loading.value = false
  step.value = 'email'
}

/**
 * Solicita el código OTP por correo (con URL absoluta y debug).
 */
async function requestOtp() {
  msg.value = ''
  errorMsg.value = ''
  if (!canRequest.value) {
    errorMsg.value = 'Introduce un correo válido y conecta la wallet.'
    return
  }

  loading.value = true
  try {
    // 1) Comprobar match correo↔wallet
    const checkRes = await fetch(`${API_BASE}/api/email-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: correo.value, direccionCartera: account.value })
    })
    // 🔎 Debug útil
    console.log('email-check status:', checkRes.status)
    const checkRaw = await checkRes.clone().text().catch(()=>'')
    console.log('email-check raw:', checkRaw)

    const checkJson = safeJson(checkRaw)
    if (!checkRes.ok || !checkJson.ok) throw new Error(checkJson?.error || 'email_check_failed')

    if (!checkJson.found) throw new Error('El correo no está registrado en la base de datos.')
    if (!checkJson.match) throw new Error('El email no corresponde con la cartera conectada.')

    // 2) Enviar OTP (solo si match === true)
    const res = await fetch(`${API_BASE}/api/email-otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: correo.value, direccionCartera: account.value })
    })
    console.log('otp/request status:', res.status)
    const raw = await res.clone().text().catch(()=>'')
    console.log('otp/request raw:', raw)

    const json = safeJson(raw)
    if (!res.ok || json.ok === false) throw new Error(json?.error || 'Error enviando el correo')

    auth.setEmail(correo.value)
    msg.value = 'Correo enviado — revisa tu bandeja de entrada.'
    step.value = 'code'
  } catch (err:any) {
    console.error(err)
    errorMsg.value = err?.message || 'Error de red o servidor'
  } finally {
    loading.value = false
  }
}

/**
 * Verifica el código OTP y crea sesión (con URL absoluta y debug).
 */
async function verifyOtp() {
  msg.value = ''
  errorMsg.value = ''
  if (!canVerify.value) {
    errorMsg.value = 'Introduce el código recibido.'
    return
  }

  loading.value = true
  try {
    const body = { correo: correo.value, direccionCartera: account.value, code: codigo.value }
    const res = await fetch(`${API_BASE}/api/email-otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    })
    console.log('otp/verify status:', res.status)
    const raw = await res.clone().text().catch(()=>'')
    console.log('otp/verify raw:', raw)

    const json = safeJson(raw)
    if (!res.ok || json.ok === false) throw new Error(json?.error || 'Código incorrecto o caducado')

    auth.setSessionToken(json.tokenSesion) // el back devuelve { ok:true, tokenSesion }
    msg.value = 'Correo verificado — sesión iniciada.'
    step.value = 'ok'

    // opcional: cerrar automático a los 800ms
    setTimeout(() => { close() }, 800)
  } catch (err:any) {
    console.error(err)
    errorMsg.value = err?.message || 'Código incorrecto o caducado'
  } finally {
    loading.value = false
  }
}

/** helper: parsea JSON seguro */
function safeJson(txt: string) {
  try { return JSON.parse(txt) } catch { return {} as any }
}
</script>

<style scoped>
.btn-primary{
  background:#56d399;
  color:#042024;
  padding:10px 18px;border-radius:8px;border:none;font-weight:700;cursor:pointer;
}
.connect-btn{
  background:#1c82ff;color:white;padding:10px 16px;border-radius:8px;border:none;cursor:pointer;font-weight:600;
}
.modal-backdrop{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:1200;}
.modal{ background:white; width:420px; max-width:92%; padding:20px; border-radius:10px; position:relative; box-shadow:0 8px 30px rgba(2,6,23,0.3); }
.modal h3{ margin:0 0 12px 0; }
.warning{ color:#b45309; margin-bottom:12px; }
.form label{ display:block; font-weight:600; margin-bottom:6px; }
.form input{ width:100%; padding:8px 10px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:12px; }
.actions{ display:flex; gap:8px; }
.btn-send{ background:#1c82ff;color:white;padding:8px 12px;border:none; cursor:pointer; }
.btn-cancel{ background:#e5e7eb;padding:8px 12px;border:none; cursor:pointer; }
.msg{ margin-top:10px; color:#334155; }
.error{ color:#dc2626; }
.modal-close{ position:absolute; top:8px; right:8px; border:none; background:transparent; font-size:18px; cursor:pointer; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
