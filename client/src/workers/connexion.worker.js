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
  return connexionClient.emitBlocking('genererCertificatNavigateur', params)
}

function changerMotdepasse(params) {
  return connexionClient.emitBlocking(
    'maitredescomptes/changerMotDePasse',
    params,
    {domaine: 'MaitreDesComptes.changerMotDePasse'}
  )
}

function declencherAjoutWebauthn() {
  return connexionClient.emitBlocking('maitredescomptes/challengeAjoutWebauthn', null, {noformat: true})
}

function repondreChallengeRegistrationWebauthn(authResponse) {
  return connexionClient.emitBlocking(
    'maitredescomptes/ajouterWebauthn',
    authResponse,
    {domaine: 'MaitreDesComptes.ajouterWebauthn'}
  )
}

function sauvegarderSecretTotp(transactionMaitredescles, transactionDocument) {
  const transactions = {transactionMaitredescles, transactionDocument}
  return connexionClient.emitBlocking(
    'maitredescomptes/sauvegarderSecretTotp',
    transactions,
    {domaine: 'MaitreDesComptes.sauvegarderSecretTotp'}
  )
}

function getInfoUsager(nomUsager) {
  return connexionClient.emitBlocking('getInfoUsager', {nomUsager}, {noformat: true})
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

comlinkExpose({
  ...connexionClient,
  connecter,  // Override de connexionClient.connecter

  inscrireUsager, declencherAjoutWebauthn,
  genererCertificatNavigateur,
  repondreChallengeRegistrationWebauthn, getInfoUsager, authentifierCertificat,
})
