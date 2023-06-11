# FROM node:18
FROM docker.maple.maceroc.com:5000/millegrilles_webappbase:2023.6.0

ENV MG_CONSIGNATION_HTTP=https://fichiers \
    APP_FOLDER=/usr/src/app \
    NODE_ENV=production \
    PORT=443

EXPOSE 80 443

# Creer repertoire app, copier fichiers
#WORKDIR $APP_FOLDER

COPY . $APP_FOLDER/
RUN export NODE_OPTIONS=--openssl-legacy-provider && \
    npm install --production && \
    rm -rf /root/.npm

CMD [ "npm", "run", "server" ]
