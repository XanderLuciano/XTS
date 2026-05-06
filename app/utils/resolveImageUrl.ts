/**
 * Resolves a relative InvenTree image URL to an absolute URL.
 * The API returns paths like /media/part_images/foo.png — this helper
 * prepends the server root derived from the API base URL.
 *
 * @param url - The image path (relative or absolute)
 * @param apiBaseUrl - The InvenTree API base URL (e.g. "https://inventree.example.com/api")
 * @returns The resolved absolute URL, or empty string if url is falsy
 */
export function resolveImageUrl(url: string | undefined | null, apiBaseUrl: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  // Strip /api suffix from base URL to get the server root
  const baseUrl = (apiBaseUrl || '').replace(/\/api\/?$/, '')
  return `${baseUrl}${url}`
}
