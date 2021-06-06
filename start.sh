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
export MG_MQ_URL=amqps://$HOSTMQ:5673
export PORT=3001
export MG_EXCHANGE_DEFAUT=2.prive

# Certificats MQ
export MG_MQ_CAFILE=$CERT_FOLDER/pki.millegrille.cert
export MG_MQ_CERTFILE=$CERT_FOLDER/pki.web_protege.cert
export MG_MQ_KEYFILE=$CERT_FOLDER/pki.web_protege.key

# export SERVER_TYPE=spdy  # spdy par defaut

# Parametre module logging debug
# export DEBUG=millegrilles:maitrecomptes:*,millegrilles:common:authentification
# export DEBUG=millegrilles:maitrecomptes:*,millegrilles:common:webauthn,millegrilles:common:authentification,millegrilles.common.server4
#export DEBUG=millegrilles:common:server4,millegrilles:common:routingKeyManager,\
#millegrilles:common:amqpdao,millegrilles:common:authentification,millegrilles:common:dao:comptesUsagersDao,\
#millegrilles:common:authentification,millegrilles:maitrecomptes:appSocketIo
export DEBUG=millegrilles:maitrecomptes:appSocketIo,millegrilles:maitrecomptes:www,\
millegrilles:common:webauthn,millegrilles:maitrecomptes:authentification,\
millegrilles:common:authentification
export NODE_ENV=dev

npm run server
# npm start
