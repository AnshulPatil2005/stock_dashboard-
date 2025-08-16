# -------- Build stage --------
FROM node:20-alpine AS build
WORKDIR /app

# Build arg for API base (used by Vite at build time)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# -------- Runtime stage (Nginx) --------
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Copy build
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config with proxy to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
