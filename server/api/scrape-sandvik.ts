export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const barcode = query.barcode as string

  if (!barcode) {
    throw createError({
      statusCode: 400,
      message: 'Barcode parameter is required'
    })
  }

  try {
    console.log('Searching Sandvik for barcode:', barcode)
    
    // Step 1: Search for product
    const searchResponse = await $fetch('https://www.sandvik.coromant.com/api/productsearch/searchinclassification', {
      method: 'POST',
      body: {
        query: barcode,
        taxonomy: '',
        language: 'en-gb',
        country: 'us',
        itemsPerPage: 1,
        currentPage: 0,
        measurementUnit: 'Metric',
        appliedRefiners: {},
        sortColumn: null,
        isSortAscending: true,
        includeTaxonomies: false,
        includeProperties: false
      }
    })

    console.log('Search response:', searchResponse)

    if (!searchResponse.items || searchResponse.items.length === 0) {
      throw new Error('Product not found in Sandvik catalog')
    }

    const productId = searchResponse.items[0].Id
    console.log('Found product ID:', productId)

    // Step 2: Get full product details
    const productData = await $fetch(`https://www.sandvik.coromant.com/api/productsearch/product?id=${productId}&unitOfMeasurement=Metric`)

    console.log('Product data:', productData)

    const product = productData.product
    
    // Build description from key specs
    const descriptionParts = [
      product.PRODDESCR || '',
      `Cutting Diameter: ${product.DC}mm`,
      `Usable Length: ${product.LU}mm`,
      `Overall Length: ${product.OAL}mm`,
      `Flutes: ${product.ZEFP}`,
      `Grade: ${product.GRADE}`,
      `Coating: ${product.COATING}`,
      `Materials: ${product.MaterialsString || ''}`
    ].filter(Boolean)
    
    return {
      success: true,
      data: {
        articleNumber: product.ORDCODE || '',
        name: product.ORDCODE || '',
        imageUrl: product.PICT3DVIEW || product.PRODUCTLISTPIC || '',
        description: descriptionParts.join('\n'),
        ipn: (product.ORDCODE || '').replace(/\s+/g, '-'),
        link: `https://www.sandvik.coromant.com/en-us/products/${encodeURIComponent(product.ORDCODE || '')}`
      }
    }
  } catch (error) {
    console.error('Sandvik scraping error:', error)
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Failed to scrape Sandvik product data'
    })
  }
})
