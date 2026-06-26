/// <reference lib="dom" />
import puppeteer from 'puppeteer'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const barcode = query.barcode as string

  if (!barcode) {
    throw createError({
      statusCode: 400,
      message: 'Barcode parameter is required'
    })
  }

  // Track which stage of the scrape we're in so that, if something throws,
  // the error response can tell us exactly where it failed in production.
  let stage = 'init'
  let productUrl = ''

  let browser
  try {
    console.log('Searching for barcode:', barcode)

    // Step 1: Use Hoffmann's autocomplete API to find the product
    stage = 'search-api'
    const searchUrl = `https://www.hoffmann-group.com/US/en/hus/v2/search/full_autocomplete?searchTerm=${encodeURIComponent(barcode)}`
    console.log('Calling search API:', searchUrl)

    const searchResponse = await fetch(searchUrl)
    if (!searchResponse.ok) {
      throw new Error(`Search API returned HTTP ${searchResponse.status}`)
    }
    const searchData = await searchResponse.json()

    if (!searchData.products || searchData.products.length === 0) {
      throw new Error('Product not found in search results')
    }

    const product = searchData.products[0]
    productUrl = `https://www.hoffmann-group.com/US/en/hus${product.url}`
    console.log('Found product:', product.code, 'at', productUrl)

    // Step 2: Navigate to product page to get full details
    stage = 'browser-launch'
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const page = await browser.newPage()

    stage = 'page-navigation'
    console.log('Navigating to product page:', productUrl)
    await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 })
    console.log('Page loaded successfully')

    stage = 'data-extraction'

    const data = await page.evaluate(() => {
      let articleNumber = ''
      let name = ''
      let imageUrl = ''
      const descriptionParts: string[] = []

      // Extract product name from H1
      const nameElement = document.querySelector('h1')
      name = nameElement?.textContent?.trim() || ''

      // Extract article number from page text
      const allText = document.body.innerText
      const articleMatch = allText.match(/Article no\.\s*:\s*([^\n]+)/)
      if (articleMatch && articleMatch[1]) {
        articleNumber = articleMatch[1].trim()
      }

      // Extract product image
      const images = document.querySelectorAll('img')
      for (const img of images) {
        const src = img.getAttribute('src') || ''
        if (src.includes('cdn.hoffmann-group.com') && !src.includes('navigation') && !src.includes('Teaser')) {
          imageUrl = src.startsWith('http') ? src : `https:${src}`
          break
        }
      }

      // Extract technical specs from tables
      const tables = document.querySelectorAll('table')
      tables.forEach((table) => {
        const rows = table.querySelectorAll('tr')
        rows.forEach((row) => {
          const cells = row.querySelectorAll('td')
          if (cells.length === 2) {
            const key = cells[0]?.textContent?.trim() || ''
            const value = cells[1]?.textContent?.trim() || ''

            if (key && value && value.length < 100 && !key.includes('EAN') && !key.includes('Manufacturer') && !key.includes('Article')) {
              const cleanKey = key.replace(/\s+/g, ' ')
              const cleanValue = value.replace(/\s+/g, ' ')
              if (cleanKey && cleanValue && cleanValue !== '│') {
                descriptionParts.push(`${cleanKey}: ${cleanValue}`)
              }
            }
          }
        })
      })

      return {
        articleNumber,
        name,
        imageUrl,
        description: descriptionParts.slice(0, 10).join('\n')
      }
    })

    console.log('Extracted data:', data)

    if (!data.articleNumber) {
      console.error('Failed to extract article number. Scraped data:', data)
      throw new Error('Product not found or could not extract article number')
    }

    console.log('Successfully scraped data:', data)

    return {
      success: true,
      data: {
        articleNumber: data.articleNumber,
        name: data.articleNumber,
        imageUrl: data.imageUrl,
        description: data.name,
        ipn: data.articleNumber.replace(/\s+/g, '-'),
        link: `https://www.hoffmann-group.com/US/en/hus/p/${encodeURIComponent(data.articleNumber)}`
      }
    }
  } catch (error) {
    const detail = {
      stage,
      barcode,
      productUrl: productUrl || undefined,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      // Stack is invaluable for diagnosing Puppeteer/Chromium launch failures
      // in production where stdout may not be captured.
      stack: error instanceof Error ? error.stack : undefined
    }
    console.error('Hoffmann scraping error:', detail)
    throw createError({
      statusCode: 500,
      message: `Hoffmann scrape failed at stage "${stage}": ${detail.errorMessage}`,
      // Nitro strips `message` from 5xx errors in production but preserves
      // `data`, so the client/production logs can still see what failed.
      data: detail
    })
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})
