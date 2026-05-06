# Architecture

Custom Nuxt/Vue frontend for InvenTree inventory management system.

## Tech Stack
- **Framework**: Nuxt 4
- **UI Library**: Nuxt UI
- **API**: InvenTree REST API
- **Authentication**: Token-based

## Configuration

### Environment Variables (.env)
```
NUXT_PUBLIC_INVENTREE_API_URL=http://localhost/api
NUXT_PUBLIC_INVENTREE_API_TOKEN=your-token-here
NUXT_PUBLIC_USE_MOCK_API=false
```

### API Composable
Located at `app/composables/useInventreeApi.ts`
- Provides authenticated `$fetch` instance
- Automatically adds Authorization header with token
- Base URL configured from environment

## Pages

### Create Part (`/create-part`)
Simplified interface for creating parts in InvenTree.

**Form Fields:**
- Part Name (required)
- Description (optional)
- Internal Part Number (IPN) (optional)
- Active, Component, Purchaseable toggles

### Scan (`/scan`)
Barcode scanning with manufacturer lookup integration.

### Add Stock (`/add-stock`)
Add stock to existing parts.

### Checkout (`/checkout`)
Self-service checkout kiosk for removing stock.

### Config (`/config`)
Runtime configuration for API settings.

## Mock API

For development without InvenTree:
- `GET /api/mock/parts` - List all parts
- `GET /api/mock/parts/:id` - Get single part

Add more mock endpoints in `server/api/mock/` as needed.
