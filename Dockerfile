FROM node:14

ENV MG_CONSIGNATION_HTTP=https://fichiers \
    APP_FOLDER=/usr/src/app \
    NODE_ENV=production \
    PORT=443 \
    MG_MQ_URL=amqps://mq:5673

EXPOSE 80 443

# Creer repertoire app, copier fichiers
WORKDIR $APP_FOLDER
CMD [ "npm", "run", "server" ]

COPY . $APP_FOLDER/
