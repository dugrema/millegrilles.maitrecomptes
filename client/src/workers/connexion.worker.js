import {expose as comlinkExpose} from 'comlink'

import connexionClient from '@dugrema/millegrilles.common/lib/connexionClient'

const URL_SOCKET = '/millegrilles/socket.io'

function connecter(opts) {
  opts = opts || {}
  const url = opts.url || URL_SOCKET
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

comlinkExpose({
  ...connexionClient,
  connecter,  // Override de connexionClient.connecter

  genererCertificatNavigateur,
  changerMotdepasse, declencherAjoutWebauthn, sauvegarderSecretTotp,
  repondreChallengeRegistrationWebauthn,
})
