# XTS

Nuxt app with NuxtUI for interfacing with InvenTree server.

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## Configuration

Edit `.env`:
```env
NUXT_PUBLIC_INVENTREE_API_URL=http://localhost:8000/api
NUXT_PUBLIC_INVENTREE_API_TOKEN=your-token
NUXT_PUBLIC_USE_MOCK_API=true  # Set to false for production
```

## Documentation

- [Architecture](docs/architecture.md) - Tech stack and page overview
- [Deployment](docs/deployment.md) - Container build and server setup
- [Barcode Scraper](docs/barcode-scraper.md) - Auto-import from manufacturer sites

## License

See [LICENSE](LICENSE)
