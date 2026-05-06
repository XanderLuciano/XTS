# Deployment Guide

This app runs as a container using Podman. Build locally, transfer the image to your server.

## Prerequisites

- Node.js 20+ (for building)
- Podman (on both dev machine and server)
- podman-compose (on server)

## Build the Image

```bash
# Build the Nuxt app
npm run build

# Build the container image (for amd64 server from ARM Mac)
podman build --platform linux/amd64 -t xts .

# Export and compress
podman save xts -o xts.tar
gzip -f xts.tar
```

## Transfer to Server

```bash
rsync -avz --progress xts.tar.gz xanderr@xts.local:~/xts-frontend/
```

## Server Setup (First Time)

```bash
cd ~/xts-frontend

# Decompress and load the image
gunzip -f xts.tar.gz
podman load -i xts.tar

# Create environment config
cp .env.example .env

# Edit with your production values
nano .env
```

Example `.env` for production:
```
NUXT_PUBLIC_INVENTREE_API_URL=http://localhost:8000/api
NUXT_PUBLIC_INVENTREE_API_TOKEN=your-production-token
NUXT_PUBLIC_USE_MOCK_API=false
```

## Start the App

```bash
podman-compose up -d
```

The app will be available at `http://server-ip:3000`

## Auto-Start on Boot

```bash
# Generate systemd service
podman generate systemd --name xts --files

# Install and enable
sudo mv container-xts.service /etc/systemd/system/
sudo systemctl enable container-xts
```

## Updating the App

On your dev machine:
```bash
npm run build
podman build --platform linux/amd64 -t xts .
podman save xts -o xts.tar
gzip -f xts.tar
rsync -avz --progress xts.tar.gz xanderr@xts.local:~/xts-frontend/
```

On the server:
```bash
cd ~/xts-frontend
docker-compose down
gunzip -f xts.tar.gz
podman load -i xts.tar
docker-compose up -d
```

## Useful Commands

```bash
# View logs
podman-compose logs -f

# Restart
podman-compose restart

# Stop
podman-compose down

# Check status
podman ps
```
