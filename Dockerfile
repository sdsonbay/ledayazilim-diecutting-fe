# syntax=docker/dockerfile:1.7
# Web: Expo static export → nginx (root olmayan, :8080).
# Aynı imaj dev ve prod'da çalışır; API adresi çalışma anında API_PROXY_PASS ile verilir.
FROM node:22-alpine AS build
WORKDIR /app
ENV CI=1 EXPO_NO_TELEMETRY=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx expo export --platform web --output-dir dist

FROM nginxinc/nginx-unprivileged:1.29-alpine
ENV API_PROXY_PASS=http://leda-diecutting-api:8080/api/
# nginx imajı /etc/nginx/templates/*.template dosyalarını başlangıçta envsubst ile işler.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
