export interface Part {
  pk: number
  name: string
  description: string
  IPN: string
  revision: string
  category: number | null
  active: boolean
  virtual: boolean
  component: boolean
  assembly: boolean
  purchaseable: boolean
  salable: boolean
  trackable: boolean
  in_stock: number
  link: string
  image: string | null
  thumbnail: string | null
}

export interface StockItem {
  pk: number
  part: number
  quantity: number
  location: number | null
  serial: string | null
  batch: string | null
  notes: string
}

export interface PartCategory {
  pk: number
  name: string
}

export interface StockLocation {
  pk: number
  name: string
}

export interface CreatePartDto {
  name: string
  IPN: string
  description?: string
  link?: string
  remote_image?: string
  category?: number | null
  active?: boolean
  virtual?: boolean
}

export interface AddStockDto {
  part: number
  quantity: number
  location?: number | null
  notes?: string
}

export interface RemoveStockDto {
  quantity: number
  notes?: string
}

export interface AddToExistingStockDto {
  quantity: number
  notes?: string
}

export interface StockTakeEntry {
  id: string
  barcode: string
  part: Part
  stockItemPk: number
  systemCount: number
  confirmedCount: number
  status: 'loading' | 'loaded' | 'error'
  errorMessage?: string
  addedAt: number
}

export interface StockTakeResult {
  success: boolean
  processedItems: number
  skippedItems: number
  failedItems: StockTakeEntry[]
  message: string
}

export interface AdjustStockParams {
  stockItemPk: number
  currentQuantity: number
  newQuantity: number
  notes?: string
}

export interface PersistedStockTakeLog {
  entries: StockTakeEntry[]
  savedAt: number
}
