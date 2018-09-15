FROM node:alpine

RUN mkdir /app

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . ./
VOLUME /app/config
CMD ["node", "radarr.js"]
