Maitre des comptes
Authentification web pour MilleGrilles

# Développement

Installer une millegrille localement et configurer nginx pour rediriger vers les ports du serveur web et react 
de développement.

S'assurer d'avoir expose les ports du middleware (mq, mongo, redis) avec le script **instance**/bin/dev/publish_ports.sh.

## Web

Fichier /var/opt/millegrilles/nginx/modules/millegrilles.location.

- Port web 4001
- Port react 3002

## Paramètres serveur

- CA_PEM=/var/opt/millegrilles/configuration/pki.millegrille.cert
- CERT_PEM=/var/opt/millegrilles/secrets/pki.maitrecomptes.cert
- KEY_PEM=/var/opt/millegrilles/secrets/pki.maitrecomptes.cle
- REDIS_PASSWORD_PATH=/var/opt/millegrilles/secrets/passwd.redis.txt
- WEB_PORT=4001
- MQ_HOSTNAME=localhost
- REDIS_HOSTNAME=localhost

## Client react

Aller dans le repertoire client/ du projet.

- sudo apt install cmake build-essential
- Installer nodeJS 20
- Installer react-app-rewired : npm i -g react-app-rewired
- Preparer les dépendances avec : npm i
- Activer parametre
