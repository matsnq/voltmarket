FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY knexfile.js ./
COPY migrations ./migrations
COPY seeds ./seeds
COPY src ./src

RUN mkdir -p /app/uploads/products

EXPOSE 3000
CMD ["node", "src/server.js"]
