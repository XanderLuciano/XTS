# Barcode-to-InvenTree Auto-Import

Automated product data scraping from Hoffmann Group website based on UPC/EAN barcodes, with editable preview before creating parts in InvenTree.

## Features

### Web Scraper API Endpoint
**File:** `/server/api/scrape-hoffmann.ts`

- Accepts barcode as query parameter
- Launches headless Chrome browser
- Navigates to Hoffmann Group search URL with barcode
- Extracts product data: article number, name, image URL, technical specs
- Returns structured JSON response

**API Usage:**
```
GET /api/scrape-hoffmann?barcode=4045197914866
```

**Response:**
```json
{
  "success": true,
  "data": {
    "articleNumber": "206043 3X15",
    "name": "Solid carbide torus cutter...",
    "imageUrl": "https://cdn.hoffmann-group.com/...",
    "description": "Cutting edge ⌀ DC: 3 mm\nCoating: DLC\n...",
    "ipn": "206043-3X15",
    "link": "https://www.hoffmann-group.com/US/en/hus/p/206043%203X15"
  }
}
```

### Scan Page Integration
**File:** `/app/pages/scan.vue`

- "Lookup" button next to each scanned barcode
- Loading state indicator during scraping
- Modal form for reviewing and editing scraped data
- Image preview in modal
- InvenTree part creation directly from modal

**User Workflow:**
1. Scan or enter barcode → Press Enter
2. Click "Lookup" button → API scrapes Hoffmann website
3. Modal opens with pre-filled form (editable)
4. Review/edit data, preview image
5. Click "Create Part" → Part created in InvenTree

### Data Mapping
**Hoffmann → InvenTree:**
- Article number → Name
- Article number (spaces to dashes) → IPN
- Technical specs table → Description
- First product image → Image URL
- Constructed URL → Link

## Testing

### Valid Hoffmann Barcode
- Barcode: `4045197914866`
- Expected: Successfully scrapes product data

### Invalid Barcode
- Barcode: `0000000000000`
- Expected: Error toast "Product not found"

## Future Enhancements
- Support for multiple manufacturers (DigiKey, Mouser, McMaster-Carr)
- Manufacturer detection from barcode format
- Cache scraped results
- Bulk import functionality
- Rate limiting for scraper API
