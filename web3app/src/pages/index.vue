<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCryptoStore } from '~/stores/crypto'
import { useAuthStore } from '~/stores/auth'
import EmailModal from '~/components/EmailModal.vue'
import DocumentsList from '~/components/DocumentsList.vue'
import logoEri from '~/pages/img/eri-logo.png'

const crypto = useCryptoStore()
const auth = useAuthStore()

const { account, guestPosts, guestPostsCount } = storeToRefs(crypto)
// ⬇️ ahora viene del auth store
const { emailVerified } = storeToRefs(auth)

const { connectWallet, wave, checkIfWalletIsConnected } = crypto

const messageInput = ref<string | null>(null)
const waveSectionRef = ref<HTMLElement | null>(null)

// si usas Vite-SSG / SSR, puedes mover esto a main.ts (isClient)
onMounted(async () => {
  await checkIfWalletIsConnected?.()
  await auth.validateSession() // <-- activa sesión si el JWT sigue vigente (< 30 min)
})

// ✅ cuando se verifique el email, hacemos scroll automático a la sección wave
watch(emailVerified, async (v) => {
  if (v) {
    await nextTick()
    waveSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
</script>

<template>
  <div class="relative">
    <!-- fixed header so logo stays in top-left -->
    <header class="site-header fixed top-0 left-0 z-50 flex items-center p-3">
      <img :src="logoEri" alt="logoEri" class="h-10 sm:h-12 w-auto" />
    </header>

    <!-- main content: add top padding so it doesn't sit under the fixed header -->
    <div class="flex flex-col items-center py-8 pt-16">
    <main>
        <!-- PASO 1: Conectar wallet -->
        <div v-if="!account" class="w-full max-w-md p-4 border rounded shadow">
          <h2 class="text-xl mb-2">Conecta tu wallet</h2>
          <p class="mb-4 text-sm text-gray-600">Necesitamos tu wallet para continuar.</p>
          <button class="bg-green-500 text-white rounded px-4 py-2" @click="connectWallet">
            Connect Wallet
          </button>
        </div>

        <!-- PASO 2: Verificación de email -->
        <div v-else-if="!emailVerified" class="w-full max-w-md p-4 border rounded shadow mt-6">
          <h2 class="text-xl mb-2">Verifica tu correo</h2>
          <p class="text-sm text-gray-600 mb-4">
            Te enviaremos un código de verificación a tu correo.
          </p>
          <EmailModal />
          <p class="text-xs text-gray-500 mt-3">
            Tras validar el código, podras utiizar nuestra app.
          </p>
        </div>

        <!-- PASO 3: Función wave -->
        <!--<div v-else class="w-full max-w-2xl mt-8" ref="waveSectionRef">
          <div class="mb-5 px-4">
            <label class="block mb-2 font-semibold">Mensaje (máx 20)</label>
            <input
              v-model="messageInput"
              name="guestBookInfo"
              class="w-full py-3 px-4 shadow border rounded"
              maxlength="20"
              placeholder="Escribe un mensaje..."
            />
            <div class="flex justify-end mt-4">
              <button class="bg-yellow-400 rounded px-6 py-3" @click="wave(messageInput)">
                Send
              </button>
            </div>
          </div>

          <div class="border shadow w-full max-w-md p-4 mt-6 mx-auto">
            <h3 class="text-2xl mb-4">Number Of Entries: {{ guestPostsCount }}</h3>
            <div v-for="(guestPost, idx) in guestPosts" :key="idx" class="flex flex-col m-auto" :class="{'mt-4': idx > 1}">
              <div v-if="guestPost.message" class="flex justify-between w-full">
                <span class="font-semibold">{{ guestPost.timestamp }}</span>
                <span>{{ guestPost.message }}</span>
              </div>
            </div>
          </div>
        </div>-->

        <div v-else class="w-full max-w-2xl mt-8" ref="waveSectionRef">
          <div class="w-full max-w-2xl mt-8">
            <DocumentsList />
          </div>
        </div>    

    </main>
    
    </div>
  </div>
</template>

