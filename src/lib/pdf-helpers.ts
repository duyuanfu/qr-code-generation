/**
 * Helper to identify whether a media item is a PDF document
 */
export function isPdfFile(item: { name?: string; type?: string; url?: string }): boolean {
  if (!item) return false;
  if (item.type && (item.type === 'application/pdf' || item.type.includes('pdf'))) {
    return true;
  }
  const name = item.name || item.url || '';
  return /\.pdf($|\?)/i.test(name);
}
