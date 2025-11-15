import { searchProducts } from '@/actions'
import { Wardrobe } from '@/components/wardrobe'
import type { ProductSummary } from '@/lib/types'

const INITIAL_SEARCH_TERMS = [
  'surf shorts',
  'surf boards',
  'rash guard shirt',
] as const

export default async function Home() {
  const productGroups = await Promise.all(
    INITIAL_SEARCH_TERMS.map((term) => searchProducts(term, 3)),
  )

  const wardrobeProducts: ProductSummary[] = productGroups.flat()

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted font-sans">
      <Wardrobe initialProducts={wardrobeProducts} />
    </div>
  )
}
