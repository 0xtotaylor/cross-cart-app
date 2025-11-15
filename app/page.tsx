import { Content } from '@/components/content'
import type { ProductSummary } from '@/lib/types'

export default async function Home() {
  const wardrobeProducts: ProductSummary[] = []

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted font-sans">
      <Content initialProducts={wardrobeProducts} />
    </div>
  )
}
