import { NextResponse } from 'next/server'

import { searchProducts } from '@/actions'

const DEFAULT_LIMIT = 4
const MAX_LIMIT = 15

export async function POST(request: Request) {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 },
    )
  }

  const query =
    typeof (payload as { query?: unknown })?.query === 'string'
      ? (payload as { query: string }).query.trim()
      : ''

  if (!query) {
    return NextResponse.json(
      {
        error:
          'Provide a natural language description (e.g., "retro surfboard" or "red rash guard") to search.',
      },
      { status: 400 },
    )
  }

  const limitInput = (payload as { limit?: unknown })?.limit
  const limit =
    typeof limitInput === 'number' && Number.isFinite(limitInput)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitInput)))
      : DEFAULT_LIMIT

  try {
    const products = await searchProducts(query, limit)
    return NextResponse.json({ products })
  } catch (error) {
    console.error('Product search failed:', error)
    return NextResponse.json(
      { error: 'Product search failed. Please try again.' },
      { status: 500 },
    )
  }
}
