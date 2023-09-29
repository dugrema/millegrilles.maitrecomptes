import {expose as comlinkExpose} from 'comlink'

import { MESSAGE_KINDS } from '@dugrema/millegrilles.utiljs/src/constantes'

// import connexionClient from '@dugrema/millegrilles.common/lib/connexionClient'
import * as connexionClient from '@dugrema/millegrilles.reactjs/src/connexionClient'

const URL_SOCKET = '/millegrilles/socket.io'

function ping() {
  return true
}

// function connecter(opts) {
//   opts = opts || {}
//   const appendLog = opts.appendLog

//   if(appendLog) appendLog('connexion.worker connecter')

//   var url = opts.url
//   if(!url) {
//     // Utiliser le serveur local mais remplacer le pathname par URL_SOCKET
//     const urlLocal = new URL(opts.location)
//     urlLocal.pathname = URL_SOCKET
//     urlLocal.hash = ''
//     urlLocal.search = ''
//     url = urlLocal.href
//   }
//   console.debug("Connecter socket.io sur url %s", url)
//   return connexionClient.connecter(url, {...opts, transports: ['websocket', 'polling']})
// }

function genererCertificatNavigateur(params) {
  return connexionClient.emitBlocking('genererCertificatNavigateur', params, {noformat: true})
}

function declencherAjoutWebauthn() {
  return connexionClient.emitBlocking('challengeAjoutWebauthn', null, {noformat: true})
}

function repondreChallengeRegistrationWebauthn(authResponse) {
  return connexionClient.emitBlocking(
    'ajouterCleWebauthn',
    authResponse,
    {kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'CoreMaitreDesComptes', action: 'ajouterCle', attacherCertificat: true}
  )
}

async function getInfoUsager(nomUsager, opts) {
  opts = opts || {}
  try {
    const reponse = await connexionClient.emitBlocking('getInfoUsager', {...opts, nomUsager}, {noformat: true})
    return reponse
  } catch(err) {
    console.error("Erreur getInfoUsager ", err)
    throw err
  }
}

function chargerCompteUsager() {
  // Charge le compte associe au certificat de l'usager
  return connexionClient.emitBlocking(
    'chargerCompteUsager', 
    {}, 
    {kind: MESSAGE_KINDS.KIND_REQUETE, domaine: 'CoreMaitreDesComptes', action: 'chargerUsager', attacherCertificat: true})
}

function inscrireUsager(nomUsager, csr) {
  return connexionClient.emitBlocking('inscrireUsager', {nomUsager, csr}, {noformat: true})
}

function authentifierCertificat(challenge) {
  return connexionClient.emitBlocking(
    'authentifierCertificat',
    {...challenge},
    {kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'login', attacherCertificat: true}
  )
}

async function authentifierWebauthn(data, opts) {
  opts = opts || {}
  const noformat = opts.noformat === false?false:true  // Default a true, on peut forcer false pour Signer
  const attacherCertificat = !noformat
  try {
    // const dataStr = JSON.parse(JSON.stringify(data))
    // console.debug("Emettre : %O", dataStr)
    console.debug("authentifierWebauthn Emettre : %O", data)
    const reponse = await connexionClient.emitBlocking(
      'authentifierWebauthn',
      data,
      {
        kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'MaitreDesComptes', 
        noformat: true,
        // attacherCertificat, noformat, // pour cas ou certificat absent
      }
    )
    console.debug("Reponse ", reponse)
    return reponse
  } catch(err) {
    console.error("Erreur emitBlocking authentifierWebauthn", err)
    throw err
  }
}

function authentifierCleMillegrille(data) {
  console.debug("authentifierCleMillegrille %O", data)
  return connexionClient.emitBlocking('authentifierCleMillegrille', data, {noformat: true})
}

// function ecouterFingerprintPk(fingerprintPk, cb) {
//   connexionClient.socketOn('fingerprintPk', cb)
//   return connexionClient.emitBlocking('ecouterFingerprintPk', {fingerprintPk}, {noformat: true})
// }

// function arretFingerprintPk(fingerprintPk, cb) {
//   connexionClient.socketOff('fingerprintPk')
//   // return connexionClient.emitBlocking('ecouterFingerprintPk', {fingerprintPk}, {noformat: true})
// }

function getChallengeDelegation() {
  return connexionClient.emitBlocking('getChallengeDelegation', {}, {kind: MESSAGE_KINDS.KIND_COMMANDE})
}

function requeteListeApplications(cb) {
  return connexionClient.emitBlocking(
    'topologie/listeApplicationsDeployees',
    {},
    {kind: MESSAGE_KINDS.KIND_REQUETE, domaine: 'CoreTopologie', action: 'listeApplicationsDeployees', attacherCertificat: true}
  )
}

function activerDelegationParCleMillegrille(commande) {
  return connexionClient.emitBlocking(
    'activerDelegationParCleMillegrille',
    commande,
    {kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'CoreMaitreDesComptes', action: 'ajouterDelegationSignee', attacherCertificat: true}
  )
}

function ajouterCsrRecovery(nomUsager, csr) {
  // Commande "publique" (utilisee sans authentification)
  return connexionClient.emitBlocking('ajouterCsrRecovery', {nomUsager, csr}, {kind: MESSAGE_KINDS.KIND_COMMANDE, noformat: true})
}

function getRecoveryCsr(code) {
  return connexionClient.emitBlocking(
    'getRecoveryCsr', 
    {code}, 
    {kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'CoreMaitreDesComptes', action: 'getCsrRecoveryParcode', attacherCertificat: true}
  )
}

function signerRecoveryCsr(commande) {
  return connexionClient.emitBlocking(
    'signerRecoveryCsr', 
    commande, 
    {kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'CoreMaitreDesComptes', action: 'signerCompteUsager', attacherCertificat: true}
  )
}

function genererChallenge(commande) {
  return connexionClient.emitBlocking(
    'genererChallenge', 
    commande, 
    {kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'CoreMaitreDesComptes', action: 'genererChallenge', attacherCertificat: true}
  )
}

function signerCompteUsager(commande) {
  return connexionClient.emitBlocking(
    'signerCompteUsager', 
    commande, 
    {kind: MESSAGE_KINDS.KIND_COMMANDE, domaine: 'CoreMaitreDesComptes', action: 'signerCompteUsager', attacherCertificat: true}
  )
}

// Listeners
function enregistrerCallbackEvenementsActivationFingerprint(fingerprintPk, cb) { 
  return connexionClient.subscribe('ecouterEvenementsActivationFingerprint', cb, {fingerprintPk}) 
}

function retirerCallbackEvenementsActivationFingerprint(fingerprintPk, cb) { 
  return connexionClient.unsubscribe('retirerEvenementsActivationFingerprint', cb, {fingerprintPk}) 
}

comlinkExpose({
 ...connexionClient, 
  ping,
  // connecter,  // Override de connexionClient.connecter

  chargerCompteUsager,

  inscrireUsager, declencherAjoutWebauthn,
  genererCertificatNavigateur,
  repondreChallengeRegistrationWebauthn, getInfoUsager,
  authentifierCertificat, authentifierWebauthn, authentifierCleMillegrille,
  /* ecouterFingerprintPk, arretFingerprintPk, */
  requeteListeApplications,
  activerDelegationParCleMillegrille, ajouterCsrRecovery, getRecoveryCsr, signerRecoveryCsr,
  getChallengeDelegation,
  genererChallenge, signerCompteUsager,

  // Listeners
  enregistrerCallbackEvenementsActivationFingerprint, retirerCallbackEvenementsActivationFingerprint,

})
