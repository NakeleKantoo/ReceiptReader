# Use lightweight Node.js image        
FROM node:20-slim

# Create app directory

WORKDIR /app

# Copy package info and install dependencies     
COPY package*.json ./

RUN npm install --production

# Copy rest of the code

COPY . .

# Expose the web server port
EXPOSE 3030

#touch db
RUN touch purchases.db
RUN chmod 666 purchases.db
                               
CMD ["node", "server.js"]
