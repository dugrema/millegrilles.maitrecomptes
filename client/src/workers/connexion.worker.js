import {expose as comlinkExpose} from 'comlink'

// import connexionClient from '@dugrema/millegrilles.common/lib/connexionClient'
import * as connexionClient from '@dugrema/millegrilles.reactjs/src/connexionClient'

const URL_SOCKET = '/millegrilles/socket.io'

function ping() {
  return true
}

function connecter(opts) {
  opts = opts || {}
  const appendLog = opts.appendLog

  if(appendLog) appendLog('connexion.worker connecter')

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

function chargerCompteUsager() {
  // Charge le compte associe au certificat de l'usager
  return connexionClient.emitBlocking(
    'chargerCompteUsager', 
    {}, 
    {domaine: 'CoreMaitreDesComptes', action: 'chargerUsager', attacherCertificat: true})
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
    //{domaine: 'login', attacherCertificat: true}
    {domaine: 'local', noformat: true}  // noformat -> pour cas ou certificat absent
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
    {domaine: 'CoreTopologie', action: 'listeApplicationsDeployees', attacherCertificat: true}
  )
}

function activerDelegationParCleMillegrille(commande) {
  return connexionClient.emitBlocking(
    'activerDelegationParCleMillegrille',
    commande,
    {domaine: 'CoreMaitreDesComptes', action: 'ajouterDelegationSignee', attacherCertificat: true}
  )
}

function ajouterCsrRecovery(nomUsager, csr) {
  // Commande "publique" (utilisee sans authentification)
  return connexionClient.emitBlocking('ajouterCsrRecovery', {nomUsager, csr})
}

function getRecoveryCsr(code) {
  return connexionClient.emitBlocking(
    'getRecoveryCsr', 
    {code}, 
    {domaine: 'CoreMaitreDesComptes', action: 'getCsrRecoveryParcode', attacherCertificat: true}
  )
}

function signerRecoveryCsr(commande) {
  return connexionClient.emitBlocking(
    'signerRecoveryCsr', 
    commande, 
    {domaine: 'CoreMaitreDesComptes', action: 'signerCompteUsager', attacherCertificat: true}
  )
}

comlinkExpose({
 ...connexionClient, 
  ping,
  connecter,  // Override de connexionClient.connecter

  getInfoIdmg, chargerCompteUsager,

  inscrireUsager, declencherAjoutWebauthn,
  genererCertificatNavigateur,
  repondreChallengeRegistrationWebauthn, getInfoUsager,
  authentifierCertificat, authentifierWebauthn, authentifierCleMillegrille,
  ecouterFingerprintPk, arretFingerprintPk, requeteListeApplications,
  activerDelegationParCleMillegrille, ajouterCsrRecovery, getRecoveryCsr, signerRecoveryCsr,

})
