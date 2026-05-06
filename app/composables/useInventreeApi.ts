import { InventreeService } from '~/services/inventree.service'

export const useInventreeApi = () => {
  const config = useRuntimeConfig()
  const useMock = config.public.useMockApi

  // Public config provides defaults, localStorage overrides
  let baseURL = config.public.inventreeApiUrl
  let token = config.public.inventreeApiToken
  
  if (process.client) {
    const savedUrl = localStorage.getItem('inventree_api_url')
    const savedToken = localStorage.getItem('inventree_api_token')
    
    if (savedUrl) baseURL = savedUrl
    if (savedToken) token = savedToken
  }

  baseURL = useMock ? '/api/mock' : baseURL

  const apiClient = $fetch.create({
    baseURL,
    headers: token ? { Authorization: `Token ${token}` } : {}
  })

  return new InventreeService(apiClient)
}


