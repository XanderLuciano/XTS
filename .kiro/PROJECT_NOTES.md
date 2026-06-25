# XTS - Project Notes

**Created**: 2026-01-13  
**Last Updated**: 2026-01-15

> **Note**: Always update structure and cleanup notes when making changes

## Project Overview

A custom Nuxt 3 web application that provides a simplified interface for the InvenTree inventory management system. The app focuses on streamlined workflows for creating parts, managing inventory, and integrating barcode scanning with automated product data scraping.

**Location**: `/Users/xanderr/dev/xts`

This is a **separate custom frontend** that works alongside the official InvenTree deployment.

## Tech Stack

- **Framework**: Nuxt 3 (v4.2.2) / Vue
- **UI Library**: Nuxt UI (v4.3.0)
- **Language**: TypeScript
- **Package Manager**: pnpm (v10.26.1)
- **Web Scraping**: Puppeteer (v24.35.0)
- **API**: InvenTree REST API (token-based authentication)

## Development Environment

### Container Runtime
- Using **Podman** instead of Docker
- Podman machine configured in **rootful mode** to allow port 80/443 binding
- Initialize: `podman machine init --cpus 6 --memory 2048 --disk-size 100 --rootful`

### Related Projects

#### inventree-server
Official InvenTree backend + frontend deployment using Docker Compose

**Location**: `/Users/xanderr/dev/inventree-server`

**Access**:
- Frontend & API: `http://localhost` (port 80)
- Admin credentials: `admin` / `admin` (change after first login)

**Architecture**:
- PostgreSQL database (inventree-db)
- Redis cache (inventree-cache)
- Gunicorn web server (inventree-server) - internal only on port 8000
- Background worker (inventree-worker)
- Caddy reverse proxy (inventree-proxy) - serves static files and proxies to backend

**Key Configuration**:
- `INVENTREE_TAG=stable` - uses stable release with pre-built frontend
- `INVENTREE_SITE_URL="http://localhost"` - Caddy listens on port 80
- Backend exposed internally only via `expose: 8000` (not `ports`)

**Commands**:
```bash
# Start server
cd inventree-server && podman compose up -d

# Stop server
cd inventree-server && podman compose down

# Update InvenTree
podman compose run --rm inventree-server invoke update

# View logs
podman logs <container-name>
```

## Project Structure

```
xts/
├── app/
│   ├── components/        # Vue components
│   │   ├── AppLogo.vue
│   │   └── TemplateMenu.vue
│   ├── composables/       # Reusable composition functions
│   │   └── useInventreeApi.ts
│   ├── pages/            # Application pages/routes
│   │   ├── index.vue
│   │   ├── scan.vue
│   │   ├── create-part.vue
│   │   ├── add-stock.vue
│   │   └── config.vue
│   ├── services/         # API service layer
│   │   └── inventree.service.ts
│   └── types/            # TypeScript type definitions
│       └── inventree.ts
├── server/
│   └── api/              # Server-side API endpoints
│       ├── mock/         # Mock API for development
│       ├── scrape-hoffmann.ts
│       └── scrape-sandvik.ts
├── public/               # Static assets
└── powers/               # Kiro Powers (NuxtUI components reference)
```

## Configuration

### Environment Variables (.env)

```env
# InvenTree server URL
NUXT_PUBLIC_INVENTREE_API_URL=http://localhost:8000/api

# InvenTree API token (leave empty for mock mode)
NUXT_PUBLIC_INVENTREE_API_TOKEN=

# Set to 'true' for mock API, 'false' for production
NUXT_PUBLIC_USE_MOCK_API=true
```

### Development Modes

1. **Mock API Mode** (default): Uses local mock data for safe development
2. **Production API Mode**: Connects to real InvenTree server

## Key Features

### 1. Part Creation (`/create-part`)

Simplified interface for creating parts in InvenTree with essential fields:
- Part Name (required)
- Description
- Internal Part Number (IPN)
- Active toggle
- Component toggle
- Purchaseable toggle

### 2. Barcode Scanning & Auto-Import (`/scan`)

**Workflow:**
1. Scan or enter barcode
2. Barcode appears in scan history
3. Click "Lookup" button
4. System scrapes product data from manufacturer website
5. Modal opens with pre-filled, editable form
6. Review/edit data and preview image
7. Create part in InvenTree

**Supported Manufacturers:**
- Hoffmann Group (implemented)
- Sandvik (API endpoint exists)

### 3. Web Scraping API

**Endpoint**: `/api/scrape-hoffmann?barcode={barcode}`

**Scraped Data:**
- Article number
- Product name
- Product image URL
- Technical specifications
- Constructed product link

**Data Mapping (Hoffmann → InvenTree):**
- Article number → Name
- Article number (spaces to dashes) → IPN
- Technical specs → Description
- First product image → Image URL
- Constructed URL → Link

### 4. Bin Locations (`/locations`)

Create and label warehouse bin locations.

**Location code format:** `ROOM.SHELF.ROW.BIN`, each component zero-padded to 3
digits (0–999), e.g. Room 1 / Rack 2 / Shelf 3 / Bin 4 → `001.002.003.004`.
(Display wording is Room → Rack → Shelf → Bin; the underlying component keys
remain room/shelf/row/bin for backwards compatibility.)

**Workflow:**
1. Enter Room/Shelf/Row/Bin numbers (live-previewed as an encoded code)
2. Create the location — stored as an InvenTree stock location (`/stock/location/`)
   with the encoded code as its name and a human-readable description
3. The encoded code is linked as a scannable barcode on the location
   (`/barcode/link/` with the `stocklocation` field)
4. Optionally auto-print a Zebra label (QR of the code + code + description)
5. Existing locations can be searched and re-printed if a label is damaged

**Printing:** routes through `usePrinterSettings().printLocation()` which respects
the configured default printer (server API vs local USB). Server endpoint:
`/api/print-location-label`. Layout helper: `composeLocationLabelElements()` in
`app/utils/label.ts`. Code utilities live in `app/utils/locationCode.ts`.

**Stock-taking integration:** scanning a location QR (a value matching the code
format) on `/stock-taking` sets an "active location". Subsequently scanned items
default their confirmed location to that location, so applying the stock take
transfers them there. A banner shows the active location with a clear button.

### 5. Mock API for Development

Mock endpoints available:
- `GET /api/mock/parts` - List all parts
- `GET /api/mock/parts/:id` - Get single part

## TypeScript Interfaces

### Scan Page
```typescript
interface ScanRecord {
  barcode: string
  timestamp: Date
  loading?: boolean
}

interface ScrapedData {
  articleNumber: string
  name: string
  imageUrl: string
  description: string
  ipn: string
  link: string
}

interface PartForm {
  name: string
  IPN: string
  description: string
  link: string
  image: string
}
```

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Type checking
npm run typecheck
```

## API Integration

### Authentication
Token-based authentication using `useInventreeApi` composable:
- Automatically adds Authorization header
- Base URL configured from environment
- Provides authenticated `$fetch` instance

### Key API Endpoints

**Create Part:**
```
POST /api/part/
Body: {
  name: string
  description?: string
  IPN?: string
  active?: boolean
  component?: boolean
  purchaseable?: boolean
}
```

## Testing Recommendations

### Test Case 1: Valid Hoffmann Barcode
- Barcode: `4045197914866`
- Expected: Successfully scrapes product data
- Verify: All fields populated correctly

### Test Case 2: Invalid Barcode
- Barcode: `0000000000000`
- Expected: Error toast notification

### Test Case 3: Mock API Mode
- Verify mock endpoints return data
- Test part creation without real InvenTree instance

### Test Case 4: Production API Mode
- Verify authentication works
- Test part creation in real InvenTree
- Verify IPN format (spaces → dashes)

## Error Handling

- Missing barcode parameter → 400 error
- Product not found → 500 error with message
- Network timeout → 30 second timeout
- Scraping failure → Toast notification
- InvenTree API failure → Toast notification

## Future Enhancements

### Short-term
- [ ] Add form validation
- [ ] Add success notifications
- [ ] Improve TypeScript types for API responses
- [ ] Add loading states for all async operations

### Medium-term
- [ ] Part listing/search page
- [ ] Part editing page
- [ ] Category management
- [ ] Stock management interface
- [ ] Bulk import functionality

### Long-term
- [ ] Support multiple manufacturers (DigiKey, Mouser, McMaster-Carr)
- [ ] Manufacturer detection from barcode format
- [ ] Barcode format validation
- [ ] Cache scraped results
- [ ] Rate limiting for scraper API
- [ ] Proper authentication flow (replace hardcoded token)
- [ ] Retry logic for failed scrapes
- [ ] Store scraping success/failure in scan history

## Known Issues

- Authentication token is currently hardcoded
- No form validation on create-part page
- Limited error handling in some areas
- No caching for scraped data
- UPC-E barcodes can produce false readings when the barcode is shaking/moving — the compressed 6-digit format is more susceptible to misreads, causing the detector to report slightly different values that bypass the per-value cooldown. Low priority since UPC-E is rarely used in this workflow. A global cooldown or consecutive-frame confirmation could mitigate this if it becomes a problem.

## Kiro Powers

This project has access to the following Kiro Powers for enhanced development:

### nuxtui-components
Complete reference guide for NuxtUI 4.3.0 components with props, variants, and usage examples. Quick access to all 110+ components organized by category.

**When to use:**
- Looking up NuxtUI component props and variants
- Finding the right component for a UI pattern
- Checking component API and usage examples
- Exploring available NuxtUI components by category

**Location**: `.kiro/powers/nuxtui-components/`

## Resources

- [InvenTree API Documentation](https://docs.inventree.org/en/latest/api/api/)
- [Nuxt 3 Documentation](https://nuxt.com/)
- [Nuxt UI Documentation](https://ui.nuxt.com/)
- [Puppeteer Documentation](https://pptr.dev/)

## Workflow Preferences

- Proactively suggest updating notes when relevant changes or decisions are noticed
- Regularly suggest code cleanups to keep files manageable and maintainable
- Keep documentation synchronized with code changes

## Notes

- Project uses pnpm as package manager
- Mock API is enabled by default for safe development
- Puppeteer requires Chrome/Chromium to be installed
- All API calls go through the `useInventreeApi` composable
- Server-side scraping prevents CORS issues
- This webapp is a **custom frontend** separate from the official InvenTree UI
- Backend server runs on Podman (rootful mode) to bind to port 80

---

**Last Updated**: January 15, 2026  
**Project Status**: Active Development
