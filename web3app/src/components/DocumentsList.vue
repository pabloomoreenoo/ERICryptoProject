<template>
  <div class="w-full max-w-2xl mx-auto">
    <h2 class="text-xl font-semibold mb-3">Documentos</h2>

    <div v-if="loading" class="text-gray-500">Cargando...</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <ul v-else class="divide-y">
      <li v-for="d in docs" :key="d.id" class="flex items-center justify-between py-3">
      <div class="min-w-0">
        <p class="font-medium truncate">{{ d.title }}</p>
        <p class="text-xs text-gray-500">
          {{ formatDate(d.uploadedAt) }} · {{ d.status || '—' }}
        </p>
        <p v-if="d.signedByMe" class="text-xs text-green-700 mt-1">
          Usted ya ha firmado este documento con su dirección.
        </p>
        <p v-else-if="d.rejectedByMe" class="text-xs text-amber-700 mt-1">
          Usted ha rechazado este documento con su dirección.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button class="btn" @click="openView(d.id)">Ver</button>
        <button class="btn-secondary" @click="download(d.id)">Descargar</button>

        <!-- Si ya está completado o yo ya decidí, no muestro botones -->
        <template v-if="d.status === 'Firmado' || d.signedByMe || d.rejectedByMe">
          <span v-if="d.signedByMe" class="badge-signed">Firmado por usted ✅</span>
          <span v-else-if="d.rejectedByMe" class="badge-rejected text-red-600">Rechazado por usted ⚠️</span>
          <span v-else class="badge-final">Documento completado</span>
        </template>

        <!-- Puedo decidir: Firmar o Rechazar -->
        <template v-else>
          <button
            class="btn-sign"
            :disabled="signingId === d.id"
            @click="signDoc(d)"
          >
            {{ signingId === d.id ? 'Firmando…' : 'Firmar' }}
          </button>
          <button
            class="btn-reject"
            :disabled="rejectingId === d.id"
            @click="rejectDoc(d)"
          >
            {{ rejectingId === d.id ? 'Rechazando…' : 'Rechazar' }}
          </button>
        </template>
      </div>
    </li>
    </ul>
    <p v-if="toast" class="mt-3 text-sm" :class="toast.type === 'error' ? 'text-red-600' : 'text-green-700'">
      {{ toast.msg }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ethers } from 'ethers'
import { storeToRefs } from 'pinia'
import { useCryptoStore } from '~/stores/crypto'
import { useAuthStore } from '~/stores/auth'

// ========= Config base API =========
let apiBaseFromNuxt: string | undefined
// @ts-ignore
if (typeof useRuntimeConfig === 'function') {
  // @ts-ignore
  apiBaseFromNuxt = useRuntimeConfig()?.public?.apiBase
}
const API_BASE: string =
  apiBaseFromNuxt ||
  (import.meta as any)?.env?.VITE_API_BASE ||
  'http://localhost:5000'

// Dirección del contrato DocumentSign
const contractAddress = '0x6963872E9613b49FCe3937054F8F7F7c710F64Fd'

// ABI mínimo del contrato
const DocumentSignABI = [
  'function recordSignature(bytes32 docId, bytes32 docHash) public',
  'function recordRejection(bytes32 docId, bytes32 docHash) public',
]

// ========= Stores =========
const crypto = useCryptoStore()
const auth = useAuthStore()
const { account } = storeToRefs(crypto)
auth.loadSessionFromStorage?.() // por si tienes token persistido

// ========= Estado local =========
type Doc = {
  id: string
  title: string
  status?: string
  uploadedAt?: string
  signedByMe?: boolean
  rejectedByMe?: boolean
}
const docs = ref<Doc[]>([])
const loading = ref(true)
const error = ref('')

const signingId = ref<string | null>(null)
const rejectingId = ref<string | null>(null)
const toast = ref<{ type: 'ok' | 'error'; msg: string } | null>(null)

// -------- Carga inicial y recarga al cambiar de wallet --------
onMounted(load)
watch(account, load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const w = encodeURIComponent(account.value || '')
    const res = await fetch(`${API_BASE}/api/docs?wallet=${w}`)
    const json = await res.json()
    if (!res.ok || !json.ok) throw new Error(json?.error || 'error_list_docs')
    docs.value = json.docs
  } catch (e: any) {
    error.value = e?.message || 'Error cargando documentos'
  } finally {
    loading.value = false
  }
}

function openView(id: string) {
  window.open(`${API_BASE}/api/docs/${id}/view`, '_blank', 'noopener,noreferrer')
}
function download(id: string) {
  window.open(`${API_BASE}/api/docs/${id}/download`, '_blank', 'noopener,noreferrer')
}
function formatDate(d?: string) {
  if (!d) return ''
  return new Date(d).toLocaleString()
}

// ====== Firma del documento ======
async function signDoc(d: Doc) {
  toast.value = null
  if (!window.ethereum) {
    toast.value = { type: 'error', msg: 'MetaMask no detectado' }
    return
  }
  if (!contractAddress) {
    toast.value = { type: 'error', msg: 'Contrato de firma no configurado' }
    return
  }

  try {
    signingId.value = d.id

    // 1) Pedimos el hash real almacenado en BD
    const metaRes = await fetch(`${API_BASE}/api/docs/${d.id}/meta`)
    const metaJson = await metaRes.json()
    if (!metaRes.ok || !metaJson.ok) throw new Error(metaJson?.error || 'meta_error')

    const rawHash: string = String(metaJson.hash || metaJson.doc?.hash || '').trim()
    if (!rawHash) throw new Error('hash_not_found')
    const docHash: string = '0x' + rawHash.toLowerCase().replace(/^0x/, '')
    const docId: string = ethers.utils.id(String(d.id))

    // 2) Provider/Signer/Contract
    const provider = new ethers.providers.Web3Provider((window as any).ethereum)
    await provider.send('eth_requestAccounts', [])
    const signer = provider.getSigner()
    const contract = new ethers.Contract(contractAddress, DocumentSignABI, signer)

    // (Opcional) firma off-chain
    let signature: string | null = null
    try {
      signature = await signer.signMessage(`Firmo el documento ${d.title} (hash: ${rawHash})`)
    } catch {
      signature = null
    }

    // 3) Transacción con manejo de TRANSACTION_REPLACED
    let txHash = ''
    let receipt: ethers.providers.TransactionReceipt | undefined
    try {
      const tx = await contract.recordSignature(docId, docHash)
      txHash = tx.hash
      receipt = await tx.wait()
    } catch (e: any) {
      if (e.code === 'TRANSACTION_REPLACED' && !e.cancelled) {
        console.warn('⚡ Tx reemplazada/accelerada:', e)
        txHash = e.replacement?.hash || e.hash
        receipt = e.receipt
      } else {
        throw e
      }
    }
    if (!receipt || receipt.status !== 1) throw new Error('onchain_tx_failed')

    // 4) Notificar al backend para guardar la evidencia y actualizar estado
    const correo = auth.email || ''
    const nombreCompleto = auth.user?.email || 'Usuario'
    const publicKey = account.value || ''

    const payload = {
      correo,
      nombreCompleto,
      direccionCartera: publicKey,
      firmaDigital: signature,
      hashDocumento: docHash,
      hashTransaccion: txHash,
      certificadoPublico: publicKey,
      ipFirma: null,
      ubicacion: null,
      userAgent: navigator.userAgent,
      decision: 'aceptada',
    }

    const saveRes = await fetch(`${API_BASE}/api/docs/${d.id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const saveJson = await saveRes.json()
    if (!saveRes.ok || !saveJson.ok) throw new Error(saveJson?.error || 'server_save_error')

    toast.value = { type: 'ok', msg: 'Documento firmado correctamente' }
    await load() // refrescar lista: ahora vendrá signedByMe = true
  } catch (e: any) {
    console.error('signDoc error:', e)
    const msg = e?.reason || e?.error?.message || e?.message || 'Error firmando el documento'
    toast.value = { type: 'error', msg }
  } finally {
    signingId.value = null
  }
}

// ====== RECHAZAR (on-chain + BD) ======
async function rejectDoc(d: Doc) {
  toast.value = null

  if (!window.ethereum) {
    toast.value = { type: 'error', msg: 'MetaMask no detectado' }
    return
  }
  if (!contractAddress) {
    toast.value = { type: 'error', msg: 'Contrato de firma no configurado' }
    return
  }

  try {
    rejectingId.value = d.id

    // 1) Hash del documento (igual que en signDoc)
    const metaRes = await fetch(`${API_BASE}/api/docs/${d.id}/meta`)
    const metaJson = await metaRes.json()
    if (!metaRes.ok || !metaJson.ok) throw new Error(metaJson?.error || 'meta_error')
    const rawHash: string = String(metaJson.hash || metaJson.doc?.hash || '').trim()
    if (!rawHash) throw new Error('hash_not_found')
    const docHash: string = '0x' + rawHash.toLowerCase().replace(/^0x/, '')
    const docId: string = ethers.utils.id(String(d.id))

    // 2) Provider / signer / contract
    const provider = new ethers.providers.Web3Provider((window as any).ethereum)
    await provider.send('eth_requestAccounts', [])
    const signer = provider.getSigner()
    const contract = new ethers.Contract(contractAddress, DocumentSignABI, signer)

    // (opcional) firma off-chain indicando rechazo
    let signature: string | null = null
    try {
      signature = await signer.signMessage(`Rechazo el documento ${d.title} (hash: ${rawHash})`)
    } catch {
      signature = null
    }

    // 3) Transacción con manejo de TRANSACTION_REPLACED
    let txHash = ''
    let receipt: ethers.providers.TransactionReceipt | undefined
    try {
      const tx = await contract.recordRejection(docId, docHash)
      txHash = tx.hash
      receipt = await tx.wait()
    } catch (e: any) {
      if (e.code === 'TRANSACTION_REPLACED' && !e.cancelled) {
        console.warn('⚡ Tx reemplazada/accelerada:', e)
        txHash = e.replacement?.hash || e.hash
        receipt = e.receipt
      } else {
        throw e
      }
    }
    if (!receipt || receipt.status !== 1) throw new Error('onchain_tx_failed')

    // 4) Avisar al backend para guardar evidencia y actualizar estado
    const correo = auth.email || ''
    const nombreCompleto = auth.user?.email || 'Usuario'
    const publicKey = account.value || ''

    const payload = {
      correo,
      nombreCompleto,
      direccionCartera: publicKey,
      firmaDigital: signature,      // opcional; puede ser null
      hashDocumento: docHash,
      hashTransaccion: txHash,      // <-- importante para trazar rechazo en la chain
      certificadoPublico: publicKey,
      ipFirma: null,
      ubicacion: null,
      userAgent: navigator.userAgent,
      decision: 'rechazada',
    }

    const saveRes = await fetch(`${API_BASE}/api/docs/${d.id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const saveJson = await saveRes.json()
    if (!saveRes.ok || !saveJson.ok) {
      throw new Error(saveJson?.error || 'server_save_error')
    }

    toast.value = { type: 'ok', msg: 'Has rechazado el documento (registrado en blockchain)' }
    await load()
  } catch (e: any) {
    console.error('rejectDoc error:', e)
    const msg = e?.reason || e?.error?.message || e?.message || 'Error rechazando el documento'
    toast.value = { type: 'error', msg }
  } finally {
    rejectingId.value = null
  }
}

</script>

<style scoped>
.btn { background:#1c82ff; color:#fff; padding:8px 12px; border-radius:8px; border:none; }
.btn-secondary { background:#eef2f7; color:#111; padding:8px 12px; border-radius:8px; border:none; }
.btn-sign { background:#16a34a; color:#fff; padding:8px 12px; border-radius:8px; border:none; }
.btn-sign[disabled] { opacity:.6; cursor:not-allowed; }

.btn-reject {
  background: #dc2626; /* rojo equivalente a text-red-600 */
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
}

.btn-reject[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.badge-signed {
  background:#e6ffed;
  color:#166534;
  border:1px solid #bbf7d0;
  padding:6px 10px;
  border-radius:9999px;
  font-weight:600;
  font-size:12px;
}

.badge-rejected {
  background:#fd8a8a;
  color:darkred;
  border:1px solid #f35252;
  padding:6px 10px;
  border-radius:9999px;
  font-weight:600;
  font-size:12px;
}

.text-red-600 { color:#dc2626; }
.text-green-700 { color:#15803d; }
</style>

