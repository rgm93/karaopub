// Recorta metadatos técnicos que traen algunos vídeos de YouTube (ISRC, ℗, ©)
export function cleanTitle(t: string | null | undefined) {
  return (t ?? '')
    .replace(/\s*[|\-–—·,;]?\s*ISRC\s*:?\s*[A-Z0-9\-]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Réplica de karaoke_norm_title() de la DB: quita metadatos (paréntesis,
// ISRC, marcas "karaoke/instrumental/letra"), deja solo palabras útiles
// y las ordena — "Estopa - Tu Calorro" y "Tu Calorro - Estopa" coinciden
const SONG_NOISE =
  /\b(karaoke|version|instrumental|letra|lyrics|lyric|hd|hq|oficial|official|original|remastered|audio|video|sing along|backing track|melody|acoustic|live|en vivo|con letra)\b/gi

export function songKey(t: string | null | undefined) {
  return (t ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]|isrc:?\s*\S+/gi, ' ')
    .replace(SONG_NOISE, ' ')
    .replace(/[^a-z0-9áéíóúñü]+/gi, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')
}
