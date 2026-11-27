// Recorta metadatos técnicos que traen algunos vídeos de YouTube (ISRC, ℗, ©)
export function cleanTitle(t: string | null | undefined) {
  return (t ?? '')
    .replace(/\s*[|\-–—·,;]?\s*ISRC\s*:?\s*[A-Z0-9\-]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
