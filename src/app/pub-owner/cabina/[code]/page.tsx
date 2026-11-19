import CabinaClient from './client'

export const instant = false

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <CabinaClient code={code.toUpperCase()} />
}
