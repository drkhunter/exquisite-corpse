// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    devtools: {enabled: false},
    ssr: false,
    app: {
        head: {
            title: 'Exquisite Corpse Online',
            meta: [{name: 'viewport', content: 'width=device-width, initial-scale=1'}]
        }
    },
    css: ['@/assets/tailwind.css'],
    modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],
    routeRules: {
        '/room/**': { ssr: false }
    },
    runtimeConfig: {
        public: {
            SOCKET_SERVER: process.env.SOCKET_SERVER || 'https://exquisite-corpse-do6o.onrender.com'
        }
    }
})
