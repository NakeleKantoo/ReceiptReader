# Use lightweight Node.js image        
FROM node:20-slim                    

RUN apt-get update && \
	apt-get install -y python3 python3-pip libgl1 libglib2.0-0 libzbar0 && \
	apt-get clean && rm -rf /var/lib/apt/lists/*
    
# (Optional) Set python3 as default 'python'    
RUN ln -s /usr/bin/python3 /usr/bin/python

# Create app directory

WORKDIR /app

# Copy package info and install dependencies     
COPY package*.json ./

RUN npm install --production                            

# Copy rest of the code                  

COPY . .

RUN pip install --no-cache-dir qreader pillow beautifulsoup4 requests --break-system-packages

# Expose the web server port
EXPOSE 3030                                             

#touch db
RUN touch purchases.db
RUN chmod 666 purchases.db
                                                        
CMD ["node", "server.js"]
