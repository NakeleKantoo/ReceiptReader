# Use lightweight Node.js image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package info and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy rest of the code
COPY . .

# Expose the web server port
EXPOSE 3030

# Default command
CMD ["node", "server.js"]
