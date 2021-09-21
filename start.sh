#!/usr/bin/env bash

CERT_FOLDER=/home/mathieu/mgdev/certs
# export MG_IDMG=vPXTaPjpUErFjV5d8pKrAHHqKhFUr7GSEruCL7
# export MG_CONSIGNATION_PATH=/var/opt/millegrilles/$IDMG/mounts/consignation
export HOST=`hostname --fqdn`

# CERT_FOLDER=/opt/millegrilles/$MG_NOM_MILLEGRILLE/pki/deployeur
CERT_FOLDER=/home/mathieu/mgdev/certs

# Serveur MQ 'short' pour correspondre au nom du certificat (node name)
# export HOSTMQ=`hostname -s`
export HOSTMQ=mg-dev4.maple.maceroc.com
export MQ_HOST=$HOSTMQ
# export MG_MQ_URL=amqps://$HOSTMQ:5673
export PORT=3001
export MG_EXCHANGE_DEFAUT=2.prive
export MG_REDIS_HOST=$HOSTMQ

# Certificats MQ
export MG_MQ_CAFILE=$CERT_FOLDER/pki.millegrille.cert
export MG_MQ_CERTFILE=$CERT_FOLDER/pki.web_protege.cert
export MG_MQ_KEYFILE=$CERT_FOLDER/pki.web_protege.key

export MG_SESSION_PASSWORD=$CERT_FOLDER/passwd.maitrecomptessession

# export SERVER_TYPE=spdy  # spdy par defaut

# Parametre module logging debug
export DEBUG=millegrilles:common:server4,\
millegrilles:maitrecomptes:authentification,millegrilles:maitrecomptes:verification,millegrilles:maitrecomptes:appSocketIo,\
millegrilles:maitrecomptes:topologieDao,millegrilles:maitrecomptes:route,\
millegrilles:common:certificatmanager,millegrilles:common:amqpdao

export NODE_ENV=dev

npm run server
# npm start
