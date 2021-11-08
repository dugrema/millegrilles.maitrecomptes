import {expose as comlinkExpose} from 'comlink'

import connexionClient from '@dugrema/millegrilles.common/lib/connexionClient'

const URL_SOCKET = '/millegrilles/socket.io'

function connecter(opts) {
  opts = opts || {}
  var url = opts.url
  if(!url) {
    // Utiliser le serveur local mais remplacer le pathname par URL_SOCKET
    const urlLocal = new URL(opts.location)
    urlLocal.pathname = URL_SOCKET
    urlLocal.hash = ''
    urlLocal.search = ''
    url = urlLocal.href
  }
  console.debug("Connecter socket.io sur url %s", url)
  return connexionClient.connecter(url, opts)
}

function genererCertificatNavigateur(params) {
  return connexionClient.emitBlocking('genererCertificatNavigateur', params, {noformat: true})
}

function declencherAjoutWebauthn() {
  return connexionClient.emitBlocking('maitredescomptes/challengeAjoutWebauthn', null, {noformat: true})
}

function repondreChallengeRegistrationWebauthn(authResponse) {
  return connexionClient.emitBlocking(
    'maitredescomptes/ajouterWebauthn',
    authResponse,
    {domaine: 'CoreMaitreDesComptes', action: 'ajouterWebauthn', attacherCertificat: true}
  )
}

function getInfoUsager(nomUsager, fingerprintPk) {
  return connexionClient.emitBlocking('getInfoUsager', {nomUsager, fingerprintPk}, {noformat: true})
}

function inscrireUsager(nomUsager, csr) {
  return connexionClient.emitBlocking('inscrireUsager', {nomUsager, csr}, {noformat: true})
}

function authentifierCertificat(challenge) {
  return connexionClient.emitBlocking(
    'authentifierCertificat',
    {...challenge},
    {domaine: 'login', attacherCertificat: true}
  )
}

function authentifierWebauthn(data) {
  return connexionClient.emitBlocking(
    'authentifierWebauthn',
    data,
    {domaine: 'login', attacherCertificat: true}
  )
}

function authentifierCleMillegrille(data) {
  console.debug("authentifierCleMillegrille %O", data)
  return connexionClient.emitBlocking('authentifierCleMillegrille', data, {noformat: true})
}

function getInfoIdmg() {
  return connexionClient.emitBlocking('getInfoIdmg', {}, {noformat: true})
}

function ecouterFingerprintPk(fingerprintPk, cb) {
  connexionClient.socketOn('fingerprintPk', cb)
  return connexionClient.emitBlocking('ecouterFingerprintPk', {fingerprintPk}, {noformat: true})
}

function arretFingerprintPk(fingerprintPk, cb) {
  connexionClient.socketOff('fingerprintPk')
  // return connexionClient.emitBlocking('ecouterFingerprintPk', {fingerprintPk}, {noformat: true})
}

function requeteListeApplications(cb) {
  return connexionClient.emitBlocking(
    'topologie/listeApplicationsDeployees',
    {},
    {domaine: 'Topologie.listeApplicationsDeployees', attacherCertificat: true}
  )
}

comlinkExpose({
  ...connexionClient,
  connecter,  // Override de connexionClient.connecter

  getInfoIdmg,

  inscrireUsager, declencherAjoutWebauthn,
  genererCertificatNavigateur,
  repondreChallengeRegistrationWebauthn, getInfoUsager,
  authentifierCertificat, authentifierWebauthn, authentifierCleMillegrille,
  ecouterFingerprintPk, arretFingerprintPk, requeteListeApplications,
})
