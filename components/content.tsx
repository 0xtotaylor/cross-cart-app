'use client'

import { useCallback, useRef, useState } from 'react'

import { AppDock } from '@/components/dock'
import { Transactions } from '@/components/transcactions'
import { Button } from '@/components/ui/button'
import { TextEffect } from '@/components/ui/text-effect'
import { Wardrobe, type WardrobeHandle } from '@/components/wardrobe'
import type { ProductSummary } from '@/lib/types'

type Screen = 'intake' | 'wardrobe' | 'transactions' | 'settings'

export function Content({
  initialProducts,
}: {
  initialProducts: ProductSummary[]
}) {
  const [activeScreen, setActiveScreen] = useState<Screen>('intake')
  const [wardrobeProducts, setWardrobeProducts] =
    useState<ProductSummary[]>(initialProducts)
  const [isWardrobeLoading, setIsWardrobeLoading] = useState(false)
  const [wardrobeSearchQuery, setWardrobeSearchQuery] = useState<string | null>(
    null,
  )
  const [wardrobeError, setWardrobeError] = useState<string | null>(null)
  const [intakeBatches, setIntakeBatches] = useState<
    Array<{ id: string; query: string; count: number }>
  >([])
  const wardrobeRef = useRef<WardrobeHandle | null>(null)

  const handleWardrobeSearch = useCallback(
    async ({ query, limit }: { query?: string; limit?: number }) => {
      const normalizedQuery = query?.trim()
      if (!normalizedQuery) {
        const message =
          'Tell me what to look for, like "red rash guard" or "retro surfboard."'
        setWardrobeError(message)
        return message
      }

      setIsWardrobeLoading(true)
      setWardrobeError(null)

      try {
        const response = await fetch('/api/products/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: normalizedQuery,
            limit,
          }),
        })

        const data = (await response.json().catch(() => null)) as {
          products?: ProductSummary[]
          error?: string
        } | null

        if (!response.ok || !data?.products) {
          throw new Error(
            data?.error ||
              'Could not find wardrobe items for that request. Try a different description.',
          )
        }

        const products = data.products
        setWardrobeProducts((prev) => {
          const map = new Map(prev.map((item) => [item.id, item]))
          products.forEach((product) => map.set(product.id, product))
          return Array.from(map.values())
        })
        setWardrobeSearchQuery(normalizedQuery)
        setActiveScreen('intake')
        setIntakeBatches((prev) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            query: normalizedQuery,
            count: products.length,
          },
          ...prev,
        ])

        return `Queued ${products.length} items for "${normalizedQuery}".`
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Wardrobe search failed. Please try again.'
        setWardrobeError(message)
        return message
      } finally {
        setIsWardrobeLoading(false)
      }
    },
    [],
  )

  const totalQueuedItems = wardrobeProducts.length

  const setScreen = useCallback(
    (next: Screen) => {
      if (next === 'wardrobe' && totalQueuedItems === 0) {
        const message =
          'Collect at least one batch of wardrobe items before opening the wardrobe.'
        setWardrobeError(message)
        setActiveScreen('intake')
        return
      }
      setWardrobeError(null)
      setActiveScreen(next)
    },
    [totalQueuedItems],
  )

  const handleFinalizeWardrobe = useCallback(() => {
    if (totalQueuedItems === 0) {
      const message =
        'No wardrobe items queued yet. Ask for a few looks before jumping into the wardrobe.'
      setWardrobeError(message)
      return message
    }
    setScreen('wardrobe')
    return `Opening wardrobe with ${totalQueuedItems} queued items.`
  }, [setScreen, totalQueuedItems])

  const handleVoiceEquip = useCallback(
    async ({
      slotId,
      productId,
      productName,
    }: {
      slotId?: string
      productId?: string
      productName?: string
    }) => {
      if (!slotId) {
        return 'Provide a wardrobe slot before equipping an item.'
      }
      if (activeScreen !== 'wardrobe') {
        return 'Open the wardrobe before equipping items.'
      }
      if (!wardrobeRef.current) {
        return 'Wardrobe is still loading. Try again in a moment.'
      }
      return wardrobeRef.current.equipProduct({
        slotId,
        productId,
        productName,
      })
    },
    [activeScreen],
  )

  return (
    <>
      {activeScreen === 'intake' && (
        <div className="relative flex min-h-screen w-full flex-col bg-white">
          <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
            <div className="space-y-4">
              <TextEffect per="char" preset="fade" className="text-center">
                {
                  'Hey, Tommy! Let me gather a few pieces before we try them on.'
                }
              </TextEffect>
              <p className="text-sm text-muted-foreground">
                {
                  "Ask for multiple items with your stylist voice chat. I'll queue each request, then you can review the full wardrobe."
                }
              </p>
            </div>
            <div className="w-full max-w-xl space-y-4 rounded-3xl border border-black/5 bg-white/80 p-6 text-left shadow-lg">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Queued looks</span>
                <span>
                  {totalQueuedItems} item{totalQueuedItems === 1 ? '' : 's'}
                </span>
              </div>
              <div className="space-y-3">
                {intakeBatches.length > 0 ? (
                  intakeBatches.map((batch) => (
                    <div
                      key={batch.id}
                      className="rounded-2xl border border-black/5 bg-gray-50 px-4 py-3 text-sm">
                      <p className="font-semibold text-gray-900">
                        &quot;{batch.query}&quot;
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {batch.count} items saved
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No requests yet. Ask for a few outfits to get rolling.
                  </p>
                )}
              </div>
              {wardrobeError ? (
                <p className="text-xs font-semibold text-red-500">
                  {wardrobeError}
                </p>
              ) : null}
              <Button
                type="button"
                onClick={handleFinalizeWardrobe}
                disabled={totalQueuedItems === 0}
                className="w-full">
                Review wardrobe
              </Button>
            </div>
          </div>
        </div>
      )}
      {activeScreen === 'wardrobe' && (
        <Wardrobe
          ref={wardrobeRef}
          initialProducts={wardrobeProducts}
          isLoading={isWardrobeLoading}
          lastQuery={wardrobeSearchQuery}
          errorMessage={wardrobeError}
        />
      )}
      {activeScreen === 'transactions' && <Transactions />}
      {activeScreen === 'settings' && (
        <div className="relative flex min-h-screen w-full flex-col bg-white">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <TextEffect per="char" preset="fade" className="text-center">
              {'Settings coming soon'}
            </TextEffect>
            <p className="text-sm text-muted-foreground max-w-md">
              Voice preferences and account controls will live here. For now,
              keep exploring outfits or check your recent transactions.
            </p>
          </div>
        </div>
      )}
      <AppDock
        setScreen={setScreen}
        onSearchWardrobe={handleWardrobeSearch}
        onFinalizeWardrobe={handleFinalizeWardrobe}
        onEquipSlot={handleVoiceEquip}
      />
    </>
  )
}
