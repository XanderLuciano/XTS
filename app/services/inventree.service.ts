import type { Part, StockItem, CreatePartDto, AddStockDto, RemoveStockDto, AddToExistingStockDto, AdjustStockParams, PartCategory, StockLocation, BomItem, CreateBomItemDto, CreateAssemblyDto } from '~/types/inventree'

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

  /**
   * List parts with pagination and optional search filtering.
   * Returns results array and total count for pagination.
   */
  async listParts(params: { search?: string; limit?: number; offset?: number } = {}): Promise<{ results: Part[]; count: number }> {
    const query: Record<string, string | number> = {}
    if (params.search) query.search = params.search
    if (params.limit != null) query.limit = params.limit
    if (params.offset != null) query.offset = params.offset

    const response = await this.api('/part/', { method: 'GET', query })

    // InvenTree API returns { count, results } when pagination params are provided
    if (response?.results) {
      return { results: response.results, count: response.count ?? response.results.length }
    }
    // Fallback if the response is a plain array
    const results = Array.isArray(response) ? response : []
    return { results, count: results.length }
  }

  async getPartByIPN(ipn: string): Promise<Part[]> {
    const response = await this.api('/part/', {
      method: 'GET',
      query: { IPN: ipn }
    })
    return Array.isArray(response) ? response : response?.results || []
  }

  /**
   * Find a part by IPN and revision.
   * Returns the matching part or null if not found.
   */
  async findPartByIPNAndRevision(ipn: string, revision: string): Promise<Part | null> {
    const parts = await this.getPartByIPN(ipn)
    const match = parts.find(p => (p.revision || '') === revision)
    return match || null
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

  /**
   * Get stock items for a part filtered by batch (vendor).
   */
  async getStockItemsByBatch(partId: number, batch: string): Promise<StockItem[]> {
    const response = await this.api('/stock/', {
      method: 'GET',
      query: { part: partId, batch, in_stock: true }
    })
    return Array.isArray(response) ? response : response?.results || []
  }

  /**
   * Create a new stock item directly (does not merge into existing).
   * Used when creating vendor-specific stock line items.
   */
  async createStockItem(data: AddStockDto): Promise<StockItem> {
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

  /**
   * Add stock for a part with vendor tracking via batch field.
   * If a stock item for this part+vendor already exists, adds to it.
   * Otherwise, creates a new stock item tagged with the vendor batch.
   */
  async addStockWithVendor(partId: number, quantity: number, vendor: string, notes?: string): Promise<StockItem> {
    // Check if a stock item already exists for this part + vendor
    const existing = await this.getStockItemsByBatch(partId, vendor)

    if (existing.length > 0) {
      const item = existing[0]!
      return await this.addToExistingStock(item.pk, { quantity, notes })
    }

    // Create a new stock item with the vendor as batch
    return await this.createStockItem({
      part: partId,
      quantity,
      batch: vendor,
      notes
    })
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
   * Update a stock item's fields (e.g. batch/vendor).
   */
  async updateStockItem(stockItemPk: number, data: { batch?: string | null; notes?: string }): Promise<void> {
    await this.api(`/stock/${stockItemPk}/`, {
      method: 'PATCH',
      body: data
    })
  }

  /**
   * Update a part's fields.
   */
  async updatePart(partPk: number, data: { name?: string; IPN?: string; revision?: string; description?: string; category?: number | null }): Promise<void> {
    await this.api(`/part/${partPk}/`, {
      method: 'PATCH',
      body: data
    })
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

  // --- BOM Methods ---

  /**
   * List all assembly parts (parts with assembly=true).
   */
  async listAssemblies(params: { search?: string; limit?: number; offset?: number } = {}): Promise<{ results: Part[]; count: number }> {
    const query: Record<string, string | number | boolean> = { assembly: true }
    if (params.search) query.search = params.search
    if (params.limit != null) query.limit = params.limit
    if (params.offset != null) query.offset = params.offset

    const response = await this.api('/part/', { method: 'GET', query })

    if (response?.results) {
      return { results: response.results, count: response.count ?? response.results.length }
    }
    const results = Array.isArray(response) ? response : []
    return { results, count: results.length }
  }

  /**
   * Get BOM items for a given assembly part.
   * Includes sub_part_detail for component information.
   * Fetches full part data to ensure in_stock is available.
   */
  async getBomItems(partId: number): Promise<BomItem[]> {
    const response = await this.api('/bom/', {
      method: 'GET',
      query: { part: partId, sub_part_detail: true }
    })
    const items: BomItem[] = Array.isArray(response) ? response : response?.results || []

    // sub_part_detail may not include in_stock, so fetch full part data
    // for each unique sub_part to get accurate stock levels
    const subPartIds = [...new Set(items.map(i => i.sub_part))]
    const partMap = new Map<number, Part>()

    for (const spId of subPartIds) {
      try {
        const part = await this.getPartById(spId)
        partMap.set(spId, part)
      } catch {
        // If we can't fetch the part, leave sub_part_detail as-is
      }
    }

    // Enrich sub_part_detail with in_stock from the full part data
    for (const item of items) {
      const fullPart = partMap.get(item.sub_part)
      if (fullPart) {
        item.sub_part_detail = {
          pk: fullPart.pk,
          name: fullPart.name,
          IPN: fullPart.IPN,
          description: fullPart.description,
          thumbnail: fullPart.thumbnail,
          in_stock: fullPart.in_stock
        }
      }
    }

    return items
  }

  /**
   * Create a new assembly part (with assembly=true, component=false).
   */
  async createAssembly(data: CreateAssemblyDto): Promise<Part> {
    return await this.api('/part/', {
      method: 'POST',
      body: {
        name: data.name,
        IPN: data.IPN,
        revision: data.revision || '',
        description: data.description || '',
        category: data.category ?? null,
        assembly: true,
        component: false,
        purchaseable: false,
        active: true,
        virtual: false
      }
    })
  }

  /**
   * Add a BOM item (component) to an assembly.
   */
  async createBomItem(data: CreateBomItemDto): Promise<BomItem> {
    return await this.api('/bom/', {
      method: 'POST',
      body: data
    })
  }

  /**
   * Delete a BOM item.
   */
  async deleteBomItem(bomItemId: number): Promise<void> {
    await this.api(`/bom/${bomItemId}/`, { method: 'DELETE' })
  }

  /**
   * Update a BOM item (e.g. change quantity).
   */
  async updateBomItem(bomItemId: number, data: { quantity?: number; reference?: string; note?: string }): Promise<void> {
    await this.api(`/bom/${bomItemId}/`, {
      method: 'PATCH',
      body: data
    })
  }

  /**
   * Delete an assembly part entirely.
   */
  async deleteAssembly(partPk: number): Promise<void> {
    await this.api(`/part/${partPk}/`, { method: 'DELETE' })
  }

}
