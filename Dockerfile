# Use the official Node.js image as a base image
FROM node:18.18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the app dependencies
RUN npm install

# Copy the rest of the application files into the container
COPY . .

# Expose the port that the app will run on (default 3000 for Express)
EXPOSE 8080

# Command to run the app when the container starts
CMD ["npm", "start"]
