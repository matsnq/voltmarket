# Stage 1: build the React frontend
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: nginx with a self-signed TLS certificate
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl \
  && mkdir -p /etc/nginx/certs \
  && openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
       -keyout /etc/nginx/certs/server.key \
       -out /etc/nginx/certs/server.crt \
       -subj "/C=EE/ST=Harjumaa/L=Tallinn/O=Voltmarket Dev/CN=localhost" \
       -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
