import type { Part, StockItem, CreatePartDto, AddStockDto, RemoveStockDto, AddToExistingStockDto, AdjustStockParams, PartCategory, StockLocation } from '~/types/inventree'

export class InventreeService {
  constructor(private api: any) {}

  /**
   * Scan a barcode using InvenTree's barcode scanning API
   * Returns the part associated with the barcode if found
   */
  async scanBarcode(barcode: string): Promise<Part | null> {
    try {
      const response = await this.api('/barcode/', {
        method: 'POST',
        body: { barcode }
      })
      
      // InvenTree barcode API returns different structures based on what was found
      // If a part is found directly or via stock item
      if (response?.part) {
        // If response.part is a number (pk), fetch the full part
        if (typeof response.part === 'number') {
          return await this.getPartById(response.part)
        }
        return response.part as Part
      }
      
      // If a stock item was found, get its part
      if (response?.stockitem) {
        const stockItemPk = typeof response.stockitem === 'number' 
          ? response.stockitem 
          : response.stockitem.pk
        const stockItem = await this.api(`/stock/${stockItemPk}/`)
        if (stockItem?.part) {
          const partPk = typeof stockItem.part === 'number' ? stockItem.part : stockItem.part.pk
          return await this.getPartById(partPk)
        }
      }
      
      // If a stock location was found, we can't get a part from it
      if (response?.stocklocation) {
        return null
      }
      
      return null
    } catch (error: any) {
      // 400 error typically means barcode not found
      if (error?.status === 400 || error?.statusCode === 400) {
        return null
      }
      throw error
    }
  }

  /**
   * Get a part by its primary key (ID)
   */
  async getPartById(pk: number): Promise<Part> {
    return await this.api(`/part/${pk}/`)
  }

  async searchParts(query: string): Promise<Part[]> {
    const response = await this.api(`/part/?search=${encodeURIComponent(query)}`)
    return Array.isArray(response) ? response : response?.results || []
  }

  async getPartByIPN(ipn: string): Promise<Part[]> {
    const response = await this.api('/part/', {
      method: 'GET',
      query: { IPN: ipn }
    })
    return Array.isArray(response) ? response : response?.results || []
  }

  async getPartByName(name: string): Promise<Part[]> {
    const response = await this.api('/part/', {
      method: 'GET',
      query: { name }
    })
    return Array.isArray(response) ? response : response?.results || []
  }

  async getCategories(): Promise<PartCategory[]> {
    const response = await this.api('/part/category/')
    return Array.isArray(response) ? response : response?.results || []
  }

  async getLocations(): Promise<StockLocation[]> {
    const response = await this.api('/stock/location/')
    return Array.isArray(response) ? response : response?.results || []
  }

  async checkPartExists(ipn: string, name: string): Promise<{ exists: boolean; field?: string }> {
    // Only check IPN since InvenTree API doesn't support exact name filtering
    const byIPN = await this.getPartByIPN(ipn)
    if (byIPN.length > 0) {
      return { exists: true, field: 'IPN' }
    }

    return { exists: false }
  }

  async createPart(data: CreatePartDto): Promise<Part> {
    return await this.api('/part/', {
      method: 'POST',
      body: {
        ...data,
        category: data.category ?? null,
        active: data.active ?? true,
        component: data.component ?? true,
        purchaseable: data.purchaseable ?? true,
        virtual: data.virtual ?? false
      }
    })
  }

  async getStockItems(partId: number): Promise<StockItem[]> {
    const response = await this.api(`/stock/?part=${partId}&in_stock=true`)
    return Array.isArray(response) ? response : response?.results || []
  }

  async addToExistingStock(stockItemId: number, data: AddToExistingStockDto): Promise<StockItem> {
    // InvenTree uses a bulk endpoint: POST /stock/add/ with items array
    const response = await this.api('/stock/add/', {
      method: 'POST',
      body: {
        items: [
          {
            pk: stockItemId,
            quantity: data.quantity
          }
        ],
        notes: data.notes || ''
      }
    })
    
    // The bulk endpoint returns success status, so we need to fetch the updated stock item
    const updatedItems = await this.api(`/stock/?pk=${stockItemId}`)
    const items = Array.isArray(updatedItems) ? updatedItems : updatedItems?.results || []
    if (items.length === 0) {
      throw new Error('Failed to retrieve updated stock item')
    }
    return items[0]
  }

  async addStock(data: AddStockDto): Promise<StockItem> {
    // 1. Check for existing stock items
    const existingItems = await this.getStockItems(data.part)
    
    // 2. If existing stock found, add to first item
    if (existingItems.length > 0) {
      const firstItem = existingItems[0]
      if (!firstItem) {
        throw new Error('Unexpected error: stock item is undefined')
      }
      return await this.addToExistingStock(firstItem.pk, {
        quantity: data.quantity,
        notes: data.notes
      })
    }
    
    // 3. Otherwise, create new stock item
    const created = await this.api('/stock/', {
      method: 'POST',
      body: data
    }) as StockItem[]

    const item = Array.isArray(created) ? created[0] : created
    if (!item?.pk) {
      throw new Error('Failed to retrieve pk from created stock item')
    }
    return item
  }

  async removeStock(stockItemId: number, data: RemoveStockDto): Promise<void> {
    // InvenTree uses a bulk endpoint: POST /stock/remove/ with items array
    await this.api('/stock/remove/', {
      method: 'POST',
      body: {
        items: [
          {
            pk: stockItemId,
            quantity: data.quantity
          }
        ],
        notes: data.notes || ''
      }
    })
  }

  /**
   * Adjust stock for a given stock item by computing the delta between
   * the new quantity and the current quantity, then calling the appropriate
   * add or remove endpoint.
   */
  async adjustStock(params: AdjustStockParams): Promise<void> {
    const delta = params.newQuantity - params.currentQuantity

    if (delta === 0) return

    const endpoint = delta > 0 ? '/stock/add/' : '/stock/remove/'
    const quantity = Math.abs(delta)

    try {
      await this.api(endpoint, {
        method: 'POST',
        body: {
          items: [{ pk: params.stockItemPk, quantity }],
          notes: params.notes || ''
        }
      })
    } catch (error: any) {
      const action = delta > 0 ? 'add' : 'remove'
      throw new Error(
        `Failed to ${action} stock for item ${params.stockItemPk}: ${error?.message || error}`
      )
    }
  }

  /**
   * Link a barcode to a stock item via InvenTree's barcode assignment API.
   */
  async linkBarcode(barcode: string, stockItemPk: number): Promise<void> {
    await this.api('/barcode/link/', {
      method: 'POST',
      body: { barcode, stockitem: stockItemPk }
    })
  }

}
