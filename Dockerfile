# Production image - uses pre-built .output directory
# Build locally with: npm run build
# Then build image with: podman build -t xts .
FROM node:20-alpine
WORKDIR /app

# Puppeteer needs a real browser at runtime. On Alpine we use the distro's
# Chromium package (musl-compatible) rather than Puppeteer's bundled Chrome,
# which is built against glibc and won't run here.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip its own Chrome download and use the system binary.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY .output .output

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
