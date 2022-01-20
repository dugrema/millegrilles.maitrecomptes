# FROM node:14
FROM docker.maceroc.com/millegrilles_webappbase:2022.0.0

ENV MG_CONSIGNATION_HTTP=https://fichiers \
    APP_FOLDER=/usr/src/app \
    NODE_ENV=production \
    PORT=443

EXPOSE 80 443

# Creer repertoire app, copier fichiers
#WORKDIR $APP_FOLDER

COPY . $APP_FOLDER/
RUN rm -rf $APP_FOLDER/node_modules/@dugrema/millegrilles.utiljs && \
    rm -rf $APP_FOLDER/node_modules/@dugrema/millegrilles.nodejs && \
    npm install --production && \
    rm -rf /root/.npm

CMD [ "npm", "run", "server" ]
