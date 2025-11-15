'use client'

import Image from 'next/image'

import {
  DraggableCardBody,
  DraggableCardContainer,
  type SwipeDirection,
} from '@/components/ui/draggable-card'
import type { ProductSummary } from '@/lib/types'

interface ProductDiscoveryStepProps {
  products: ProductSummary[]
  savedCount: number
  onProductSwipe: (product: ProductSummary, direction: SwipeDirection) => void
  formatCurrency: (price: number, currency: string) => string
  onContinue?: () => void
  canContinue?: boolean
}

export function ProductDiscoveryStep({
  products,
  savedCount,
  onProductSwipe,
  formatCurrency,
  onContinue,
  canContinue,
}: ProductDiscoveryStepProps) {
  const renderProductCard = (product: ProductSummary, index: number) => {
    const fallbackDescription =
      product.description || 'Tap through to learn more about this item.'
    // Create a fanned-out polaroid effect with varying rotations
    const rotationOffsets = [-8, -4, 0, 4, 8, -6, -2, 2, 6]
    const rotation = rotationOffsets[index % rotationOffsets.length]
    // Stagger the cards horizontally to create fan effect
    const translateX = (index - (products.length - 1) / 2) * 20
    // Z-index: later cards appear on top (stacked effect)
    const zIndex = index + 1

    return (
      <div
        key={product.id}
        className="absolute left-1/2 top-1/2 origin-center transition-transform duration-300"
        style={{
          transform: `translate(-50%, -50%) translateX(${translateX}px) rotate(${rotation}deg)`,
          zIndex,
        }}>
        <DraggableCardContainer className="flex-shrink-0">
          <DraggableCardBody
            onSwipe={(direction) => onProductSwipe(product, direction)}
            swipeThreshold={100}
            className="relative min-h-[400px] w-72 rounded-[2px] border-0 bg-white p-2.5 text-gray-900 shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:bg-white dark:text-gray-900">
            <div className="flex h-full flex-col">
              {/* Polaroid image area with white border */}
              <div className="relative h-64 w-full overflow-hidden bg-gradient-to-br from-sky-100/80 to-blue-200/50">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="288px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    No preview
                  </div>
                )}
              </div>
              {/* Polaroid bottom border area (thicker white space) */}
              <div className="flex min-h-[80px] flex-col justify-between gap-1.5 px-2 py-3">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {product.source}
                  </p>
                  <h3 className="text-sm font-semibold leading-tight line-clamp-1">
                    {product.name}
                  </h3>
                </div>
                <div className="text-xs font-semibold">
                  <span>{formatCurrency(product.price, product.currency)}</span>
                </div>
              </div>
            </div>
          </DraggableCardBody>
        </DraggableCardContainer>
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-white/30 bg-white/10 p-6 backdrop-blur-2xl transition duration-300 dark:bg-slate-900/60">
      <div className="relative min-h-[500px] w-full">
        {products.length > 0 ? (
          products.map((product, index) => renderProductCard(product, index))
        ) : (
          <div className="flex h-[500px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              You&apos;re all caught up! Refresh to fetch more surf-ready gear.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
