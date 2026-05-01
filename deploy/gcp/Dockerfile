FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY config/ ./config/
COPY deploy/gcp/generate-config.js ./generate-config.js

ENV PORT=8080
EXPOSE 8080

# generate-config.js writes config/config.json from env vars at startup
CMD ["sh", "-c", "node generate-config.js && node src/app.js"]
