# frontend/Dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (only required for runtime/dev)
RUN npm install

# Copy application code (restricted by .dockerignore)
COPY . .

# Expose port (Next.js default 3000)
EXPOSE 3000

# Command to run the application in development mode
# This enables hot-reloading for testing and and avoids build-time issues
CMD ["npm", "run", "dev"]
