import type { UserModule } from '~/types'
import { createHead } from '@vueuse/head'

// Install @vueuse/head so `useHead` has a head provider during SSR and client
export const install: UserModule = ({ app }) => {
  const head = createHead()
  app.use(head)
}
