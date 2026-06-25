// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'nuxt-mcp-dev'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      appName: 'XTS Inventory',
      appTagline: 'Quick and simple shop floor interface',
      inventreeApiUrl: '',
      inventreeApiToken: '',
      useMockApi: false,
      zebraPrinterUrl: '',
      zebraApiKey: ''
    }
  },

  routeRules: {
    // Don't prerender — runtime config (API URL, token) must come from
    // the server's environment variables, not build-time values.
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
