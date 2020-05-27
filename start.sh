#!/usr/bin/env bash

CERT_FOLDER=/home/mathieu/mgdev/certs
# export MG_IDMG=vPXTaPjpUErFjV5d8pKrAHHqKhFUr7GSEruCL7
# export MG_CONSIGNATION_PATH=/var/opt/millegrilles/$IDMG/mounts/consignation
export HOST=`hostname`

# CERT_FOLDER=/opt/millegrilles/$MG_NOM_MILLEGRILLE/pki/deployeur
CERT_FOLDER=/home/mathieu/mgdev/certs

# export COUPDOEIL_SESSION_TIMEOUT=15000
export MG_MQ_CAFILE=$CERT_FOLDER/pki.millegrille.cert
export MG_MQ_CERTFILE=$CERT_FOLDER/pki.coupdoeil.cert
export MG_MQ_KEYFILE=$CERT_FOLDER/pki.coupdoeil.key

# export WEB_CERT=~/.acme.sh/mg-dev3.maple.maceroc.com/fullchain.cer
# export WEB_KEY=~/.acme.sh/mg-dev3.maple.maceroc.com/mg-dev3.maple.maceroc.com.key
export MG_MQ_URL=amqps://$HOST:5673
export PORT=3001

export MG_HTTPPROXY_SECURE=false
export MG_CONSIGNATION_HTTP=https://$HOST:3003

# export SERVER_TYPE=spdy

# Parametre module logging debug
export DEBUG=millegrilles:*

npm run server
# npm start
