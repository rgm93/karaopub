import SalaClient from './client'

export const instant = false

export default async function Page({
  params,
}: {
  params: Promise<{ pub: string; code: string }>
}) {
  const { pub, code } = await params
  return <SalaClient pubId={pub} code={code.toUpperCase()} />
}
