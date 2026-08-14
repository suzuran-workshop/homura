<template>
  <!-- This component is never rendered; the router guard redirects before reaching it. -->
  <v-app>
    <v-main class="d-flex align-center justify-center fill-height">
      <v-progress-circular indeterminate color="primary" size="64" />
    </v-main>
  </v-app>
</template>
