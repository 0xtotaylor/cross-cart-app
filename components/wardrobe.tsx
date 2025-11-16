'use client'

import Image from 'next/image'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  GiBelt,
  GiBigDiamondRing,
  GiChelseaBoot,
  GiDropEarrings,
  GiHandBag,
  GiPearlNecklace,
  GiTrousers,
  GiTShirt,
  GiWinterGloves,
  GiWinterHat,
} from 'react-icons/gi'

import { generateOutfitImage, runAgent } from '@/actions'
import { ProductDiscoveryStep } from '@/components/product-discovery'
import { Button } from '@/components/ui/button'
import type { SwipeDirection } from '@/components/ui/draggable-card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import {
  EquippedState,
  ProductSummary,
  SelectedWardrobeItem,
  SlotId,
  WardrobeSlotImage,
} from '@/lib/types'
import { cn } from '@/lib/utils'

interface WardrobeProps {
  initialProducts: ProductSummary[]
  isLoading?: boolean
  lastQuery?: string | null
  errorMessage?: string | null
}

export type WardrobeHandle = {
  equipProduct: (params: {
    slotId: string
    productId?: string
    productName?: string
  }) => string
  generateOutfit: () => Promise<string>
  purchaseEquipped: () => Promise<string>
}

const equipmentSlots = {
  left: [
    { id: 'head' as SlotId, icon: GiWinterHat },
    { id: 'chest' as SlotId, icon: GiTShirt },
    { id: 'waist' as SlotId, icon: GiBelt },
    { id: 'legs' as SlotId, icon: GiTrousers },
    { id: 'feet' as SlotId, icon: GiChelseaBoot },
  ],
  right: [
    { id: 'ears' as SlotId, icon: GiDropEarrings },
    { id: 'neck' as SlotId, icon: GiPearlNecklace },
    { id: 'bag' as SlotId, icon: GiHandBag },
    { id: 'hand' as SlotId, icon: GiWinterGloves },
    { id: 'ring' as SlotId, icon: GiBigDiamondRing },
  ],
}

const slotKeywordMap: Record<SlotId, string[]> = {
  head: [
    'hat',
    'helmet',
    'cap',
    'beanie',
    'visor',
    'headband',
    'bucket hat',
    'sun hat',
  ],
  chest: [
    'shirt',
    'tee',
    't-shirt',
    'rash guard',
    'rashguard',
    'hoodie',
    'jacket',
    'top',
    'vest',
    'long sleeve',
    'pullover',
    'sweater',
    'crew',
    'tank',
    'jersey',
    'fleece',
  ],
  waist: ['belt', 'waist', 'fanny', 'hip pack', 'utility belt', 'sash', 'wrap'],
  legs: [
    'short',
    'shorts',
    'pant',
    'pants',
    'trouser',
    'trousers',
    'legging',
    'leggings',
    'tight',
    'tights',
    'boardshort',
    'boardshorts',
    'baggies',
    'jean',
    'jeans',
    'bottom',
    'skirt',
  ],
  feet: [
    'shoe',
    'shoes',
    'boot',
    'boots',
    'sandal',
    'sandals',
    'flip-flop',
    'flip flop',
    'flop',
    'sneaker',
    'sneakers',
    'sock',
    'socks',
    'slide',
    'slides',
  ],
  ears: ['earring', 'ear ring', 'ear cuff', 'ear stud', 'ear hoop'],
  neck: ['necklace', 'scarf', 'chain', 'neck gaiter', 'bandana', 'choker'],
  bag: [
    'bag',
    'backpack',
    'back pack',
    'tote',
    'duffle',
    'duffel',
    'dry bag',
    'sling',
    'satchel',
    'pouch',
  ],
  hand: [
    'glove',
    'gloves',
    'mitten',
    'mittens',
    'surfboard',
    'longboard',
    'shortboard',
    'paddle',
    'wax',
    'leash',
    'fin',
  ],
  ring: ['ring', 'band', 'signet'],
}

const slotFallbackPriority: SlotId[] = ['chest', 'legs', 'hand', 'bag']

const allSlotIds: SlotId[] = [
  'head',
  'chest',
  'waist',
  'legs',
  'feet',
  'ears',
  'neck',
  'bag',
  'hand',
  'ring',
]

const isSlotId = (value: string): value is SlotId =>
  allSlotIds.includes(value as SlotId)

const buildProductSearchText = (product: ProductSummary) =>
  `${product.name} ${product.description ?? ''}`.toLowerCase()

const productMatchesSlot = (product: ProductSummary, slotId: SlotId) => {
  const keywords = slotKeywordMap[slotId] ?? []
  if (!keywords.length) return false
  const haystack = buildProductSearchText(product)
  return keywords.some((keyword) => haystack.includes(keyword))
}

const SLOT_LABELS: Record<SlotId, string> = {
  head: 'Head',
  chest: 'Chest',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  ears: 'Ears',
  neck: 'Neck',
  bag: 'Bag',
  hand: 'Hand',
  ring: 'Ring',
}

const PORTRAIT_TARGET_WIDTH = 420
const FLOW_STEPS = [
  {
    id: 'discover' as const,
    title: 'Swipe surf finds',
    description: 'Save the gear you want to try by swiping cards to the right.',
  },
  {
    id: 'wardrobe' as const,
    title: 'Build your wardrobe',
    description: 'Assign saved products into each slot to finish the look.',
  },
]

type FlowStep = (typeof FLOW_STEPS)[number]['id']

export const Wardrobe = forwardRef<WardrobeHandle, WardrobeProps>(
  function WardrobeInner(
    {
      initialProducts,
      isLoading = false,
      lastQuery,
      errorMessage: wardrobeSearchError,
    }: WardrobeProps,
    ref,
  ) {
    const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null)
    const [equippedSlots, setEquippedSlots] = useState<EquippedState>({})
    const [productDeck, setProductDeck] =
      useState<ProductSummary[]>(initialProducts)
    const [savedProducts, setSavedProducts] = useState<ProductSummary[]>([])
    const [activeStep, setActiveStep] = useState<FlowStep>('discover')
    const [portraitPreviewUrl, setPortraitPreviewUrl] = useState<string | null>(
      null,
    )
    const [isPortraitUploading, setIsPortraitUploading] = useState(false)
    const [portraitError, setPortraitError] = useState<string | null>(null)
    const [generatedOutfitUrl, setGeneratedOutfitUrl] = useState<string | null>(
      null,
    )
    const [isGeneratingOutfit, setIsGeneratingOutfit] = useState(false)
    const [outfitError, setOutfitError] = useState<string | null>(null)
    const [isAgentRunning, setIsAgentRunning] = useState(false)
    const portraitInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
      setProductDeck(initialProducts)
      setSavedProducts([])
      setEquippedSlots({})
      setActiveStep('discover')
      setSelectedSlot(null)
    }, [initialProducts])

    const hasAnyEquipped = useMemo(
      () => Object.values(equippedSlots).some(Boolean),
      [equippedSlots],
    )

    const equippedCount = useMemo(
      () => Object.values(equippedSlots).filter(Boolean).length,
      [equippedSlots],
    )

    const canAdvanceToWardrobe = savedProducts.length > 0

    const wardrobeStatusMessage = useMemo(() => {
      if (isLoading) {
        return lastQuery
          ? `Searching for “${lastQuery}”…`
          : 'Searching wardrobe…'
      }

      if (lastQuery) {
        return `Showing ${productDeck.length} finds for “${lastQuery}”.`
      }

      return null
    }, [isLoading, lastQuery, productDeck.length])

    const shouldShowWardrobeStatus =
      isLoading || Boolean(lastQuery) || Boolean(wardrobeSearchError)

    useEffect(() => {
      if (!canAdvanceToWardrobe && activeStep === 'wardrobe') {
        setActiveStep('discover')
      }
    }, [activeStep, canAdvanceToWardrobe])

    const goToWardrobeStep = useCallback(() => {
      if (canAdvanceToWardrobe) {
        setActiveStep('wardrobe')
      }
    }, [canAdvanceToWardrobe])

    const goToDiscoveryStep = useCallback(() => {
      setActiveStep('discover')
    }, [])

    const handleProductSwipe = useCallback(
      (product: ProductSummary, direction: SwipeDirection) => {
        setProductDeck((prev) => prev.filter((item) => item.id !== product.id))

        if (direction !== 'right') return

        setSavedProducts((prev) => {
          if (prev.some((item) => item.id === product.id)) return prev
          return [...prev, product]
        })
      },
      [],
    )

    const handleAssignSlot = useCallback(
      (slotId: SlotId, product: ProductSummary) => {
        setEquippedSlots((prev) => ({
          ...prev,
          [slotId]: product,
        }))
        setSelectedSlot(null)
      },
      [],
    )

    const handleClearSlot = useCallback((slotId: SlotId) => {
      setEquippedSlots((prev) => {
        const next = { ...prev }
        delete next[slotId]
        return next
      })
    }, [])

    const ensureProductSaved = useCallback((product: ProductSummary) => {
      setProductDeck((prev) => prev.filter((item) => item.id !== product.id))
      setSavedProducts((prev) => {
        if (prev.some((item) => item.id === product.id)) return prev
        return [...prev, product]
      })
    }, [])

    const findProductCandidate = useCallback(
      ({
        productId,
        normalizedQuery,
      }: {
        productId?: string
        normalizedQuery?: string
      }) => {
        const matcher = (product: ProductSummary) => {
          if (productId && product.id === productId) return true
          if (normalizedQuery) {
            return buildProductSearchText(product).includes(normalizedQuery)
          }
          return false
        }

        const equippedPool = Object.values(equippedSlots).filter(
          (item): item is ProductSummary => Boolean(item),
        )
        const pools = [...savedProducts, ...productDeck, ...equippedPool]

        return pools.find(matcher) ?? null
      },
      [equippedSlots, productDeck, savedProducts],
    )

    const handleVoiceEquipProduct = useCallback(
      ({
        slotId,
        productId,
        productName,
      }: {
        slotId: string
        productId?: string
        productName?: string
      }) => {
        const normalizedSlot = slotId?.toLowerCase()
        if (!normalizedSlot || !isSlotId(normalizedSlot)) {
          return 'Choose a valid wardrobe slot (head, chest, waist, legs, feet, ears, neck, bag, hand, or ring).'
        }
        const normalizedQuery = productName?.trim().toLowerCase()
        if (!productId && !normalizedQuery) {
          return 'Tell me which product to equip by name or product ID.'
        }
        const product = findProductCandidate({
          productId,
          normalizedQuery,
        })
        if (!product) {
          return 'I could not find that product in the saved wardrobe yet.'
        }

        ensureProductSaved(product)
        handleAssignSlot(normalizedSlot, product)
        const slotLabel = SLOT_LABELS[normalizedSlot] ?? normalizedSlot
        return `Equipped ${product.name} to the ${slotLabel}.`
      },
      [ensureProductSaved, findProductCandidate, handleAssignSlot],
    )

    const formatCurrency = useCallback((price: number, currency: string) => {
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency || 'USD',
          maximumFractionDigits: 0,
        }).format(price)
      } catch {
        return `$${price.toFixed(2)}`
      }
    }, [])

    const slotOptionsMap = useMemo(() => {
      const map = allSlotIds.reduce(
        (acc, slotId) => {
          acc[slotId] = []
          return acc
        },
        {} as Record<SlotId, ProductSummary[]>,
      )

      savedProducts.forEach((product) => {
        const matchedSlots: SlotId[] = []
        allSlotIds.forEach((slotId) => {
          if (productMatchesSlot(product, slotId)) {
            matchedSlots.push(slotId)
          }
        })

        if (matchedSlots.length === 0) {
          const fallback = slotFallbackPriority.find((slotId) => map[slotId])
          if (fallback) {
            map[fallback].push(product)
          }
          return
        }

        matchedSlots.forEach((slotId) => {
          map[slotId].push(product)
        })
      })

      return map
    }, [savedProducts])

    const handlePortraitFileChange = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null
        if (!file) return

        setPortraitError(null)

        const maxSizeBytes = 5 * 1024 * 1024
        const allowedMimeTypes = new Set([
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/webp',
          'image/heic',
          'image/heif',
        ])

        if (file.size > maxSizeBytes) {
          setPortraitError('Portrait must be 5 MB or smaller.')
          if (portraitInputRef.current) portraitInputRef.current.value = ''
          return
        }

        if (file.type && !allowedMimeTypes.has(file.type)) {
          setPortraitError('Portrait must be a JPG, PNG, HEIC, or WEBP image.')
          if (portraitInputRef.current) portraitInputRef.current.value = ''
          return
        }

        setIsPortraitUploading(true)
        try {
          const formData = new FormData()
          formData.append('portrait', file)

          const response = await fetch('/api/virtual-try-on/portrait', {
            method: 'POST',
            body: formData,
          })
          const data = await response.json().catch(() => null)
          if (!response.ok || !data) {
            throw new Error(
              (data && (data as { error?: string }).error) ||
                'Failed to process portrait.',
            )
          }
          const imageUrl = data?.image as string | undefined
          if (!imageUrl) {
            throw new Error('No portrait returned from processor.')
          }

          setPortraitPreviewUrl((old) => {
            if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
            return imageUrl
          })
          setGeneratedOutfitUrl(null)
          setOutfitError(null)
        } catch (error) {
          setPortraitError(
            error instanceof Error
              ? error.message
              : 'Failed to upload portrait. Please try again.',
          )
        } finally {
          setIsPortraitUploading(false)
          if (portraitInputRef.current) portraitInputRef.current.value = ''
        }
      },
      [],
    )

    const openPortraitPicker = useCallback(() => {
      if (isPortraitUploading) return
      portraitInputRef.current?.click()
    }, [isPortraitUploading])

    const handleRunAgent = useCallback(async () => {
      if (isAgentRunning) {
        return 'Purchase already in progress.'
      }

      const purchaseItems = allSlotIds.reduce<SelectedWardrobeItem[]>(
        (acc, slotId) => {
          const product = equippedSlots[slotId]
          if (!product) return acc
          acc.push({
            ...product,
            slotId,
          })
          return acc
        },
        [],
      )

      if (!purchaseItems.length) {
        const message = 'Equip at least one slot before purchasing.'
        setPortraitError(message)
        return message
      }

      setIsAgentRunning(true)
      setPortraitError(null)
      try {
        await runAgent(purchaseItems)
        return `Purchasing ${purchaseItems.length} item${
          purchaseItems.length === 1 ? '' : 's'
        }.`
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to run agent. Please try again.'
        setPortraitError(message)
        return message
      } finally {
        setIsAgentRunning(false)
      }
    }, [equippedSlots, isAgentRunning])

    const handleGenerateOutfit = useCallback(async () => {
      if (isGeneratingOutfit) {
        return 'Already generating an outfit preview.'
      }
      if (!portraitPreviewUrl) {
        const message = 'Upload a portrait before generating an outfit.'
        setOutfitError(message)
        return message
      }
      if (!hasAnyEquipped) {
        const message = 'Equip at least one slot using your saved finds first.'
        setOutfitError(message)
        return message
      }

      setIsGeneratingOutfit(true)
      setOutfitError(null)
      try {
        const slotsPayload = allSlotIds.reduce<
          Record<SlotId, WardrobeSlotImage | null>
        >(
          (acc, slotId) => {
            const product = equippedSlots[slotId]
            acc[slotId] = product?.imageUrl
              ? { imageUrl: product.imageUrl }
              : null
            return acc
          },
          {} as Record<SlotId, WardrobeSlotImage | null>,
        )

        const result = await generateOutfitImage({
          portrait: { dataUrl: portraitPreviewUrl },
          slots: slotsPayload,
        })

        setGeneratedOutfitUrl(result.image)
        setPortraitPreviewUrl(result.image)
        return 'Outfit applied to your portrait.'
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to generate outfit. Please try again.'
        setOutfitError(message)
        return message
      } finally {
        setIsGeneratingOutfit(false)
      }
    }, [equippedSlots, hasAnyEquipped, isGeneratingOutfit, portraitPreviewUrl])

    useImperativeHandle(
      ref,
      () => ({
        equipProduct: handleVoiceEquipProduct,
        generateOutfit: handleGenerateOutfit,
        purchaseEquipped: handleRunAgent,
      }),
      [handleVoiceEquipProduct, handleGenerateOutfit, handleRunAgent],
    )

    const renderEquipmentSlotButton = (
      slot: (typeof equipmentSlots.left)[number],
      side: 'left' | 'right',
    ) => {
      const slotId = slot.id
      const Icon = slot.icon
      const isSelected = selectedSlot === slotId
      const slotLabel = SLOT_LABELS[slotId]
      const contentId = `wardrobe-slot-${slotId}`
      const assignedProduct = equippedSlots[slotId]
      const isEquipped = !!assignedProduct
      const slotOptions = slotOptionsMap[slotId] ?? []

      return (
        <Popover
          key={slotId}
          open={isSelected}
          onOpenChange={(open: boolean) =>
            setSelectedSlot(open ? slotId : null)
          }>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              aria-pressed={isSelected}
              aria-expanded={isSelected}
              aria-controls={contentId}
              className={cn(
                'relative flex h-24 w-24 items-center justify-center rounded-3xl border cursor-pointer overflow-hidden backdrop-blur-xl transition',
                isEquipped
                  ? 'border-sky-500 bg-white/40 dark:border-sky-500/70 dark:bg-white/20'
                  : 'border-white/50 bg-white/30 dark:border-white/20 dark:bg-white/10',
                'hover:border-white/70 hover:bg-white/40 dark:hover:border-white/30 dark:hover:bg-white/15',
              )}>
              {assignedProduct ? (
                <div className="relative h-full w-full">
                  {assignedProduct.imageUrl ? (
                    <Image
                      src={assignedProduct.imageUrl}
                      alt={assignedProduct.name}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-400 text-center text-xs font-semibold text-slate-700 dark:from-slate-700 dark:to-slate-900 dark:text-white">
                      {assignedProduct.name}
                    </div>
                  )}
                </div>
              ) : (
                <Icon className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            id={contentId}
            className="w-80 sm:w-96"
            side={side === 'left' ? 'right' : 'left'}
            sideOffset={12}>
            <div className="grid gap-3">
              <div className="space-y-1">
                <h4 className="font-medium leading-none">{slotLabel}</h4>
                {assignedProduct ? (
                  <p className="text-xs text-muted-foreground">
                    Equipped with {assignedProduct.name}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Swipe right on a surf find to save it as an option for this
                    slot.
                  </p>
                )}
              </div>
              {slotOptions.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {slotOptions.map((option) => {
                    const isActive = assignedProduct?.id === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleAssignSlot(slotId, option)}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-3xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                          isActive
                            ? 'border-sky-500 bg-white text-sky-900 shadow-lg dark:border-sky-400 dark:bg-slate-800'
                            : 'border-white/40 bg-white/10 text-gray-900 hover:border-white/70 dark:border-white/10 dark:bg-white/5 dark:text-gray-100',
                        )}>
                        {option.imageUrl ? (
                          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-2xl border border-white/50 bg-white/40 dark:border-white/10 dark:bg-white/10">
                            <Image
                              src={option.imageUrl}
                              alt={option.name}
                              fill
                              className="object-cover"
                              sizes="48px"
                            />
                          </div>
                        ) : (
                          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-2xl border border-white/50 bg-white/40 dark:border-white/10 dark:bg-white/10">
                            <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-muted-foreground">
                              No image
                            </div>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium leading-tight">
                            {option.name}
                          </p>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {option.source}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {formatCurrency(option.price, option.currency)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No saved items match this slot yet. Swipe relevant gear in
                  Step 1 to add options.
                </p>
              )}
              {isEquipped ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full cursor-pointer"
                  onClick={() => handleClearSlot(slotId)}>
                  Remove from slot
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      )
    }

    return (
      <>
        <input
          ref={portraitInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={handlePortraitFileChange}
        />
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {FLOW_STEPS.map((step, index) => {
              const isActive = activeStep === step.id
              const isLocked = step.id === 'wardrobe' && !canAdvanceToWardrobe
              const action =
                step.id === 'wardrobe' ? goToWardrobeStep : goToDiscoveryStep

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={action}
                  disabled={isLocked}
                  className={cn(
                    'rounded-3xl border px-4 py-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
                    isActive
                      ? 'border-sky-500/70 bg-white/40 shadow-lg dark:border-sky-500/60 dark:bg-slate-900/70'
                      : 'border-white/20 bg-white/5 hover:border-white/40 dark:border-white/10 dark:bg-slate-900/50',
                    isLocked
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer',
                  )}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </button>
              )
            })}
          </div>

          {shouldShowWardrobeStatus && (
            <div className="flex flex-col gap-2 rounded-3xl border border-white/30 bg-white/40 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex flex-wrap items-center gap-3">
                {isLoading ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-sky-700 shadow dark:bg-slate-800/60 dark:text-sky-300">
                    <Spinner className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                    <span>Fetching wardrobe picks…</span>
                  </div>
                ) : null}
                {wardrobeStatusMessage ? (
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {wardrobeStatusMessage}
                  </p>
                ) : null}
              </div>
              {wardrobeSearchError ? (
                <p className="text-xs font-medium text-red-500 dark:text-red-300">
                  {wardrobeSearchError}
                </p>
              ) : null}
            </div>
          )}

          {activeStep === 'discover' ? (
            <div className="relative">
              <ProductDiscoveryStep
                products={productDeck}
                savedCount={savedProducts.length}
                onProductSwipe={handleProductSwipe}
                formatCurrency={formatCurrency}
                onContinue={goToWardrobeStep}
                canContinue={canAdvanceToWardrobe}
              />
              {isLoading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-white/60 backdrop-blur-sm dark:bg-slate-900/60">
                  <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-gray-900 shadow dark:bg-slate-800 dark:text-gray-50">
                    <Spinner className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                    <span>Updating wardrobe…</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <section className="flex min-h-[calc(100vh-12rem)] max-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-3xl border border-dashed border-white/30 bg-white/5 pt-6 backdrop-blur-2xl transition-colors duration-300 dark:bg-slate-900/70">
              <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/30 px-6 pb-5">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Wardrobe
                </h2>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void handleGenerateOutfit()
                    }}
                    disabled={
                      isPortraitUploading ||
                      isGeneratingOutfit ||
                      isAgentRunning ||
                      !portraitPreviewUrl ||
                      !hasAnyEquipped
                    }
                    className="cursor-pointer">
                    {isGeneratingOutfit ? 'Generating...' : 'Generate Outfit'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void handleRunAgent()
                    }}
                    disabled={
                      isAgentRunning || isPortraitUploading || !hasAnyEquipped
                    }
                    className="cursor-pointer">
                    {isAgentRunning ? 'Purchasing...' : 'Purchase'}
                  </Button>
                </div>
              </header>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 pr-3 pt-6">
                <div className="flex h-full items-start justify-center">
                  <div className="h-full w-full">
                    <div className="mx-auto flex h-full min-h-[600px] w-full max-w-6xl items-start justify-center gap-4 px-4 pb-4 pt-0">
                      {/* Left slots */}
                      <div className="flex h-[560px] flex-col justify-between gap-4 pt-0">
                        {equipmentSlots.left.map((slot) =>
                          renderEquipmentSlotButton(slot, 'left'),
                        )}
                      </div>

                      {/* Portrait */}
                      <div className="relative flex h-full min-h-[600px] flex-[0.5] basis-1/2 items-start justify-center overflow-hidden rounded-lg">
                        <div className="relative z-10 flex flex-col items-center gap-4 pt-0">
                          <div
                            className="relative flex h-[560px] flex-none items-center justify-center rounded-[36px] border border-white/40 bg-white p-6 text-center shadow-inner dark:border-white/10 dark:bg-white"
                            style={{
                              width: PORTRAIT_TARGET_WIDTH,
                              minWidth: PORTRAIT_TARGET_WIDTH,
                              maxWidth: '100%',
                            }}>
                            {isPortraitUploading ? (
                              <div className="flex h-full w-full flex-col items-center justify-center">
                                <Spinner className="size-8 text-gray-400 dark:text-gray-500" />
                              </div>
                            ) : portraitPreviewUrl ? (
                              <Button
                                type="button"
                                onClick={() => {
                                  if (portraitPreviewUrl.startsWith('data:')) {
                                    // For data URLs, create a blob URL for better browser compatibility
                                    fetch(portraitPreviewUrl)
                                      .then((res) => res.blob())
                                      .then((blob) => {
                                        const blobUrl =
                                          URL.createObjectURL(blob)
                                        const newWindow = window.open(
                                          blobUrl,
                                          '_blank',
                                          'noopener,noreferrer',
                                        )
                                        // Clean up the blob URL after the window opens
                                        if (newWindow) {
                                          setTimeout(
                                            () => URL.revokeObjectURL(blobUrl),
                                            1000,
                                          )
                                        } else {
                                          URL.revokeObjectURL(blobUrl)
                                        }
                                      })
                                      .catch(() => {
                                        // Fallback: try opening data URL directly
                                        window.open(
                                          portraitPreviewUrl,
                                          '_blank',
                                          'noopener,noreferrer',
                                        )
                                      })
                                  } else {
                                    window.open(
                                      portraitPreviewUrl,
                                      '_blank',
                                      'noopener,noreferrer',
                                    )
                                  }
                                }}
                                className="relative h-full w-full cursor-pointer bg-white hover:bg-white">
                                <Image
                                  src={portraitPreviewUrl}
                                  alt="Your portrait"
                                  fill
                                  className="object-contain"
                                  unoptimized
                                />
                                {isGeneratingOutfit ? (
                                  <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                                    <Spinner className="size-10 text-gray-500" />
                                  </div>
                                ) : null}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                onClick={openPortraitPicker}
                                className="flex h-full w-full cursor-pointer items-center justify-center rounded-[28px] bg-white p-2 text-xs text-gray-500 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-600"
                                aria-label="Upload portrait">
                                <Image
                                  src="/silhouette.png"
                                  alt="Silhouette placeholder"
                                  fill
                                  className="object-contain opacity-75"
                                />
                              </Button>
                            )}
                          </div>
                          <div className="flex flex-col items-center gap-2 text-center">
                            {portraitError ? (
                              <p className="max-w-[280px] text-xs font-medium text-red-500 dark:text-red-400">
                                {portraitError}
                              </p>
                            ) : null}
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  void handleGenerateOutfit()
                                }}
                                disabled={
                                  isPortraitUploading ||
                                  isGeneratingOutfit ||
                                  isAgentRunning ||
                                  !portraitPreviewUrl ||
                                  !hasAnyEquipped
                                }
                                className="cursor-pointer text-xs">
                                {isGeneratingOutfit
                                  ? 'Generating...'
                                  : 'Generate'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  void handleRunAgent()
                                }}
                                disabled={
                                  isAgentRunning ||
                                  isPortraitUploading ||
                                  !hasAnyEquipped
                                }
                                className="cursor-pointer text-xs">
                                {isAgentRunning ? 'Purchasing...' : 'Purchase'}
                              </Button>
                            </div>
                            {outfitError ? (
                              <p className="text-xs font-medium text-red-500 dark:text-red-400">
                                {outfitError}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Right slots */}
                      <div className="flex h-[560px] flex-col justify-between gap-4 pt-0">
                        {equipmentSlots.right.map((slot) =>
                          renderEquipmentSlotButton(slot, 'right'),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </>
    )
  },
)
