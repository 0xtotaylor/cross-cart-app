import { NextResponse } from 'next/server'

import { removeBackgroundWithGoogle } from '@/actions'

export async function POST(request: Request) {
  const formData = await request.formData()
  const portrait = formData.get('portrait')

  if (!(portrait instanceof Blob)) {
    return NextResponse.json(
      { error: 'Portrait file is required.' },
      { status: 400 },
    )
  }

  const arrayBuffer = await portrait.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  try {
    const result = await removeBackgroundWithGoogle(buffer, portrait.type)
    const dataUrl = `data:${result.mimeType};base64,${result.buffer.toString(
      'base64',
    )}`

    return NextResponse.json({ image: dataUrl })
  } catch (error) {
    console.error('Portrait processing failed', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process portrait image.',
      },
      { status: 500 },
    )
  }
}
