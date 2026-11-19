import { Suspense } from 'react'
import JoinClient from './client'

export const instant = false

export default async function Page({ params }: { params: Promise<{ pub: string }> }) {
  const { pub } = await params
  return (
    <Suspense>
      <JoinClient pubId={pub} />
    </Suspense>
  )
}
