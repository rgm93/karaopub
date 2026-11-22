'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

// QR como SVG vectorial: no depende de canvas (WebViews de TV) y escala nítido a cualquier resolución
export function QRImage({ url, size = 220 }: { url: string; size?: number }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    if (!url) return
    QRCode.toString(url, { type: 'svg', margin: 1 }).then(setSvg).catch(() => {})
  }, [url, size])

  const boxStyle = { maxWidth: size, aspectRatio: '1 / 1' } as const
  if (!svg) return <div style={boxStyle} className="w-full rounded-xl bg-white/10" />
  return (
    <div
      style={boxStyle}
      className="w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
