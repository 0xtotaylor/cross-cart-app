import type { ProductSearchResponse } from '@henrylabs/sdk/resources/products/products'

export type SlotId =
  | 'head'
  | 'chest'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'ears'
  | 'neck'
  | 'bag'
  | 'hand'
  | 'ring'

export type ProductSummary = ProductSearchResponse['data'][number]

export type EquippedState = Partial<Record<SlotId, ProductSummary | null>>

export type SelectedWardrobeItem = ProductSummary & {
  slotId: SlotId
}

export type WardrobeSlotImage = {
  buffer?: Buffer
  dataUrl?: string | null
  imageUrl?: string | null
  mimeType?: string | null
}
