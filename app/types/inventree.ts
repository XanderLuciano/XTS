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
  revision?: string
  description?: string
  link?: string
  remote_image?: string
  category?: number | null
  active?: boolean
  virtual?: boolean
  component?: boolean
  purchaseable?: boolean
}

export interface AddStockDto {
  part: number
  quantity: number
  location?: number | null
  batch?: string | null
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

export interface BomItem {
  pk: number
  part: number
  sub_part: number
  sub_part_detail?: {
    pk: number
    name: string
    IPN: string
    description: string
    thumbnail: string | null
    in_stock: number
  }
  quantity: number
  reference: string
  note: string
  optional: boolean
  validated: boolean
}

export interface CreateBomItemDto {
  part: number
  sub_part: number
  quantity: number
  reference?: string
  note?: string
}

export interface CreateAssemblyDto {
  name: string
  IPN: string
  revision?: string
  description?: string
  category?: number | null
}
