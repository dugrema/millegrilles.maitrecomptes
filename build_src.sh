#!/bin/bash
set -e

source image_info.txt

echo "Nom build : $NAME"

build_app() {
  REP_CLIENT=$1
  REP_STATIC=$2

  rm -rf $REP_CLIENT/build
  rm -rf $REP_STATIC
  # rm -rf $REP_CLIENT/node_modules $REP_CLIENT/package-lock.json

  makeManifest $REP_CLIENT

  echo "Installer toutes les dependances"
  cd $REP_CLIENT
  npm i

  # echo "Copier clients vers src/deps"
  # mkdir -p $REP_CLIENT/src/deps
  # cp -r $REP_CLIENT/node_modules/millegrilles.*-client $REP_CLIENT/src/deps
  # cp -r $REP_CLIENT/node_modules/millegrilles.maitrecomptes-client/src/components $REP_CLIENT/src
  # cp -r $REP_CLIENT/node_modules/millegrilles.maitrecomptes-client/src/containers $REP_CLIENT/src
  # cp $REP_CLIENT/node_modules/millegrilles.maitrecomptes-client/src/index.* $REP_CLIENT/src
  # rm -rf $REP_CLIENT/node_modules/millegrilles.maitrecomptes-client

  echo "Build React"
  npm run build

  echo "Copier le build React vers $REP_STATIC"
  mkdir -p $REP_STATIC
  cp -r ./build/* $REP_STATIC
}

build_react() {
  echo "Build application React (/millegrilles)"
  NOM_APP=$1

  mkdir -p $REP_STATIC_GLOBAL/$NOM_APP

  REP_COMPTES_SRC="$REP_COURANT/client"
  build_app $REP_COMPTES_SRC $REP_STATIC_GLOBAL/$NOM_APP

  cd $REP_STATIC_GLOBAL
  tar -zcf ../$BUILD_FILE $NOM_APP
}

telecharger_static() {
  set -e

  DOWNLOAD_PATH="${URL_SERVEUR_DEV}:${BUILD_PATH}/$BUILD_FILE"
  echo "Telecharger le repertoire static : $DOWNLOAD_PATH"
  sftp $DOWNLOAD_PATH
  if [ $? -ne 0 ]; then
    echo "Erreur download fichier react"
    exit 1
  fi

  echo "Installation de l'application React dans $REP_STATIC_GLOBAL"
  rm -rf $REP_STATIC_GLOBAL
  mkdir $REP_STATIC_GLOBAL && \
    tar -xf $BUILD_FILE -C $REP_STATIC_GLOBAL

  echo "Nouvelle version du fichier react telechargee et installee"
}

traiter_fichier_react() {
  # Decide si on bati ou telecharge un package pour le build react.
  # Les RPi sont tres lents pour batir le build, c'est mieux de juste recuperer
  # celui qui est genere sur une workstation de developpement.
  NOM_APP=$1

  ARCH=`uname -m`
  rm -f ${NAME}.*.tar.gz

  if [ $ARCH == 'x86_64' ] || [ -z $URL_SERVEUR_DEV ]; then
    # Si on est sur x86_64, faire le build
    echo "Architecture $ARCH (ou URL serveur DEV non inclus), on fait un nouveau build React"
    build_react $NOM_APP
  else
    # Sur un RPi (aarch64, armv7l), on fait juste telecharger le repertoire static
    echo "Architecture $ARCH, on va chercher le fichier avec le build pour React sur $URL_SERVEUR_DEV"
    telecharger_static $NOM_APP
  fi
}

makeManifest() {
  PATH_APP=$1
  PATH_MANIFEST=$PATH_APP/src/manifest.build.js

  VERSION=`${REP_COURANT}/read_version.py $PATH_APP/package.json`
  DATECOURANTE=`date "+%Y-%m-%d %H:%M"`

  echo "const build = {" > $PATH_MANIFEST
  echo "  date: '$DATECOURANTE'," >> $PATH_MANIFEST
  echo "  version: '$VERSION'" >> $PATH_MANIFEST
  echo "}" >> $PATH_MANIFEST
  echo "module.exports = build;" >> $PATH_MANIFEST

  echo "Manifest $PATH_MANIFEST"
  cat $PATH_MANIFEST
}

REP_COURANT=`pwd`
REP_STATIC_GLOBAL=${REP_COURANT}/static
BUILD_FILE="${NAME}.${VERSION}.tar.gz"
BUILD_PATH="git/millegrilles.maitrecomptes"

# docker pull node:12
# npm install --production

traiter_fichier_react millegrilles
