'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function QRImage({ url, size = 220 }: { url: string; size?: number }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    QRCode.toDataURL(url, { width: size * 2, margin: 1 }).then(setSrc).catch(() => {})
  }, [url, size])

  if (!src) return <div style={{ width: size, height: size }} className="rounded-xl bg-white/10" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={`QR ${url}`} className="rounded-xl" />
}
