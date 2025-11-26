<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ethers } from 'ethers'
import { useCryptoStore } from '~/stores/crypto'

const route = useRoute()
const router = useRouter()
const store = useCryptoStore()

const loading = ref(true)
const errorMsg = ref('')
const payload = ref<{ email:string; walletAddress:string; nonce:string } | null>(null)
const signatureSending = ref(false)

async function validateToken() {
  const token = route.query.token as string | undefined
  if (!token) {
    errorMsg.value = 'Token no presente en la URL.'
    loading.value = false
    return
  }
  try {
    const res = await fetch('/api/validate-token?token=' + encodeURIComponent(token))
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || 'Token inválido o expirado')
    payload.value = json.payload
  } catch (e:any) {
    errorMsg.value = e.message || 'No se pudo validar el token.'
  } finally {
    loading.value = false
  }
}

async function signAndVerify() {
  if (!payload.value) return
  if (typeof window === 'undefined' || !window.ethereum) {
    errorMsg.value = 'MetaMask no está disponible en este navegador.'
    return
  }
  try {
    signatureSending.value = true
    const provider = new ethers.providers.Web3Provider(window.ethereum as any)
    await provider.send('eth_requestAccounts', [])
    const signer = provider.getSigner()
    const addr = await signer.getAddress()
    if (addr.toLowerCase() !== payload.value.walletAddress.toLowerCase()) {
      errorMsg.value = 'La cuenta de MetaMask no coincide con la del enlace.'
      signatureSending.value = false
      return
    }
    const message = `Confirm login for ${payload.value.email}\nWallet: ${payload.value.walletAddress}\nNonce: ${payload.value.nonce}`
    const signature = await signer.signMessage(message)

    // enviar firma al backend
    const token = route.query.token as string
    const res = await fetch('/api/verify-signature', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ token, message, signature }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || 'Verificación fallida')

    // guardar sesión y volver al home
    store.setSessionToken(json.sessionToken)
    router.replace('/')
  } catch (e:any) {
    errorMsg.value = e.message || 'Error durante la firma/verificación.'
  } finally {
    signatureSending.value = false
  }
}

onMounted(validateToken)
</script>

<template>
  <div class="mx-auto max-w-md p-6">
    <h1 class="text-2xl font-semibold mb-4">Verificación de acceso</h1>

    <div v-if="loading" class="text-gray-600">Validando token…</div>

    <div v-else-if="errorMsg" class="text-red-600">
      {{ errorMsg }}
    </div>

    <div v-else>
      <p class="mb-4">
        Email: <strong>{{ payload!.email }}</strong><br>
        Wallet: <code class="break-all">{{ payload!.walletAddress }}</code>
      </p>

      <p class="text-sm text-gray-600 mb-4">
        Pulsa “Firmar y continuar” para completar el acceso.
      </p>

      <button
        class="bg-blue-600 text-white rounded px-4 py-2"
        :disabled="signatureSending"
        @click="signAndVerify"
      >
        {{ signatureSending ? 'Firmando…' : 'Firmar y continuar' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
</style>
