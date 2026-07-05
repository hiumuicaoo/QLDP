# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy all source code
COPY . .

# Build the client app and compile the Express server
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built artifacts from the builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_DIR=/app/data

# Create data and dangphi directories
RUN mkdir -p /app/data /app/dangphi

# Port exposed by the server
EXPOSE 3000

# Start command
CMD ["node", "dist/server.cjs"]
