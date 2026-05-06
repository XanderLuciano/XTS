// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'nuxt-mcp-dev'
  ],

  ui: {
    colors: {
      primary: 'blue',
      secondary: 'gray',
      success: 'green',
      warning: 'orange',
      error: 'red',
      info: 'cyan',
      neutral: 'slate',
      blue: 'blue',
      purple: 'purple',
      pink: 'pink',
      yellow: 'yellow',
      teal: 'teal',
      indigo: 'indigo'
    }
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

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
  },

  runtimeConfig: {
    public: {
      inventreeApiUrl: '',
      inventreeApiToken: '',
      useMockApi: false
    }
  }
})
