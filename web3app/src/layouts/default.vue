<script setup lang="ts">
import logoEri from '~/pages/img/eri-logo.png'
</script>

<template>
  <!-- fixed top-left logo available on all layouts -->
  <header class="site-header fixed top-0 left-0 z-50 flex items-center p-3">
    <img :src="logoEri" alt="logoEri" class="h-10 sm:h-12 w-auto" />
  </header>

  <main class="pt-16">
    <RouterView />
    <TheFooter />
    <div mx-auto mt-5 text-center text-sm opacity-50>
      
    </div>
  </main>
</template>
