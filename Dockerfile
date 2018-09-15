FROM node:alpine
MAINTAINER itsmegb

RUN apk add --update unzip wget

RUN mkdir /app && \
    wget --no-check-certificate https://github.com/itsmegb/telegram-radarr-bot/archive/master.zip -P /app && \
    unzip /app/master.zip -d /app && \
    rm /app/master.zip

WORKDIR /app/telegram-radarr-bot-master

RUN npm install

RUN ln -s /app/telegram-radarr-bot-master/config /config

RUN apk del unzip wget

VOLUME /config

CMD ["node", "radarr.js"]
