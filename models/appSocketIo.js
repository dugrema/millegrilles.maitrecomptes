// Gestion evenements socket.io pour /millegrilles
const debug = require('debug')('millegrilles:maitrecomptes:appSocketIo');
const multibase = require('multibase')
const { fingerprintPublicKeyFromCertPem } = require('@dugrema/millegrilles.utiljs/src/certificats')
const { upgradeProteger, authentification, webauthn } = require('@dugrema/millegrilles.nodejs')

const {
  init: initWebauthn,
  genererRegistrationOptions,
  validerRegistration,
  verifierChallenge,
  webauthnResponseBytesToMultibase,
} = webauthn

const {
  verifierUsager,
  verifierSignatureCertificat,
  verifierSignatureMillegrille,
  CONST_CHALLENGE_CERTIFICAT,
  CONST_WEBAUTHN_CHALLENGE,
} = authentification

const { inscrire } = require('../models/inscrire')

function init(hostname, idmg) {
  debug("Init appSocketIo : hostname %s, idmg %s", hostname, idmg)
  initWebauthn(hostname,idmg)
}

function configurerEvenements(socket) {
  const configurationEvenements = {
    listenersPublics: [
      {eventName: 'disconnect', callback: _ => {deconnexion(socket)}},
      {eventName: 'getInfoIdmg', callback: async (params, cb) => {wrapCb(getInfoIdmg(socket, params), cb)}},
      {eventName: 'getInfoUsager', callback: async (params, cb) => {wrapCb(verifierUsager(socket, params), cb)}},
      {eventName: 'inscrireUsager', callback: async (params, cb) => {wrapCb(inscrire(socket, params), cb)}},
      {eventName: 'ecouterFingerprintPk', callback: async (params, cb) => {wrapCb(ecouterFingerprintPk(socket, params), cb)}},
      {eventName: 'authentifierCertificat', callback: async (params, cb) => {wrapCb(authentifierCertificat(socket, params), cb)}},
      {eventName: 'authentifierWebauthn', callback: async (params, cb) => {wrapCb(authentifierWebauthn(socket, params), cb)}},
      {eventName: 'authentifierCleMillegrille', callback: async (params, cb) => {wrapCb(authentifierCleMillegrille(socket, params), cb)}},
      {eventName: 'ajouterCsrRecovery', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'ajouterCsrRecovery', {params, cb})}},
    ],
    listenersPrives: [
      {eventName: 'changerApplication', callback: (params, cb) => {changerApplication(socket, params, cb)}},
      {eventName: 'subscribe', callback: (params, cb) => {subscribe(socket, params, cb)}},
      {eventName: 'unsubscribe', callback: (params, cb) => {unsubscribe(socket, params, cb)}},
      {eventName: 'getCertificatsMaitredescles', callback: cb => {getCertificatsMaitredescles(socket, cb)}},
      {eventName: 'upgradeProteger', callback: async (params, cb) => {wrapCb(upgradeProteger(socket, params), cb)}},
    ],
    listenersProteges: [
      {eventName: 'maitredescomptes/challengeAjoutWebauthn', callback: async cb => {wrapCb(challengeAjoutWebauthn(socket), cb)}},
      {eventName: 'maitredescomptes/ajouterWebauthn', callback: async (params, cb) => {wrapCb(ajouterWebauthn(socket, params), cb)}},
      {eventName: 'sauvegarderCleDocument', callback: (params, cb) => {sauvegarderCleDocument(socket, params, cb)}},
      {eventName: 'topologie/listeApplicationsDeployees', callback: async (params, cb) => {wrapCb(listeApplicationsDeployees(socket, params), cb)}},
      {eventName: 'genererCertificatNavigateur', callback: async (params, cb) => {
        wrapCb(genererCertificatNavigateurWS(socket, params), cb)
      }},
      {
        eventName: 'activerDelegationParCleMillegrille', 
        callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'activerDelegationParCleMillegrille', {params, cb})}
      },
      {
        eventName: 'chargerCompteUsager', 
        callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'chargerCompteUsager', {params, cb})}
      },
    ],
    subscriptionsPrivees: [],
    subscriptionsProtegees: [],
  }

  return configurationEvenements
}

function deconnexion(socket) {
  debug("Deconnexion %s", socket.id)
}

function wrapCb(promise, cb) {
  promise.then(reponse=>cb(reponse))
    .catch(err=>{
      debug("Erreur commande socket.io: %O", err)
      cb({err: ''+err, stack: err.stack})
    })
}

function listeApplicationsDeployees(socket, params) {
  return socket.topologieDao.getListeApplications(params)
}

async function ajouterWebauthn(socket, params) {
  debug("ajouterWebauthn, params : %O", params)

  const comptesUsagers = socket.comptesUsagersDao,
        hostname = socket.hostname
  const session = socket.handshake.session
  const nomUsager = session.nomUsager

  // debug(session)

  const {desactiverAutres, reponseChallenge, fingerprintPk} = params

  // S'assurer que :
  //  - le socket est en mode protege; ou
  //  - l'enregistrement est pour une activation de fingerprint_pk valide
  var demandeAutorisee = false
  if( socket.modeProtege ) {
    demandeAutorisee = true
  } else if(fingerprintPk) {
    const compteUsager = await comptesUsagers.chargerCompte(session.nomUsager)
    debug("Compte usager, activer par fingerprintPk: %s : %O", fingerprintPk, compteUsager)
    if(compteUsager.activations_par_fingerprint_pk) {
      const infoActivation = compteUsager.activations_par_fingerprint_pk[fingerprintPk]
      if(infoActivation.associe === false) {
        demandeAutorisee = true
      }
    }
  }

  if( ! demandeAutorisee ) {
    debug("Demande d'enregistrement webauthn refusee")
    return false
  }

  try {
    const sessionChallenge = socket.webauthnChallenge
    const attestationExpectations = socket.attestationExpectations
    const informationCle = await validerRegistration(reponseChallenge, attestationExpectations)

    // Copier la version signee de la reponse client
    // Permet de valider le compte (userId) sur le back-end
    // informationCle.reponseClient = params

    const nomUsager = session.nomUsager
    const opts = {reset_cles: desactiverAutres, fingerprint_pk: fingerprintPk}
    debug("Challenge registration OK pour usager %s, info: %O", nomUsager, informationCle)
    await comptesUsagers.ajouterCle(nomUsager, informationCle, params, opts)

    // Trigger l'upgrade proteger
    // const methodeVerifiee = 'webauthn.' + informationCle.credId
    // await upgradeProteger(socket, {nouvelEnregistrement: true, methodeVerifiee})
    if(!socket.modeProtege) {
      socket.activerModeProtege()
    }

    return true
  } catch(err) {
    debug("ajouterWebauthn : erreur registration : %O", err)
  }

  return false
}

async function challengeAjoutWebauthn(socket) {
  debug('challengeAjoutWebauthn')

  const session = socket.handshake.session
  const nomUsager = session.nomUsager,
        userId = session.userId,
        hostname = socket.handshake.headers.host

  // Challenge via Socket.IO
  debug("Registration request, userId %s, usager %s, hostname %s", userId, nomUsager, hostname)

  const registrationChallenge = await genererRegistrationOptions(userId, nomUsager, {hostname})
  debug("Registration challenge : %O", registrationChallenge)
  debug("Attestation challenge : %O", registrationChallenge.attestation)

  socket.webauthnChallenge = registrationChallenge.challenge
  socket.attestationExpectations = registrationChallenge.attestationExpectations

  return registrationChallenge.attestation
}

function changerApplication(socket, application, cb) {
  debug("Changer application, params:\n%O\nCallback:\n%O", application, cb)
  socket.changerApplication(application, cb)
}

function subscribe(socket, params, cb) {
  debug("subscribe, params:\n%O\nCallback:\n%O", params, cb)
  socket.subscribe(params, cb)
}

function unsubscribe(socket, params, cb) {
  debug("unsubscribe, params:\n%O\nCallback:\n%O", params, cb)
  socket.unsubscribe(params, cb)
}

async function getInfoIdmg(socket, params) {
  const session = socket.handshake.session
  // debug("appSocketIo.getInfoIdmg session %O", session)
  // const comptesUsagers = socket.comptesUsagers
  // cb({idmgCompte: session.idmgCompte, idmgsActifs: session.idmgsActifs})
  const reponse = {
    connecte: true,
    nomUsager: session.nomUsager,
    userId: session.userId,
    auth: session.auth
  }

  debug("appSocketIo.getInfoIdmg session Reponse %O", reponse)

  return reponse
}

async function genererCertificatNavigateurWS(socket, params) {
  debug("Generer certificat navigateur, params: %O", params)
  const session = socket.handshake.session,
        amqpdao = socket.amqpdao

  const nomUsager = session.nomUsager,
        userId = session.userId
  const modeProtege = socket.modeProtege

  if(modeProtege) {
    // debug("Handshake du socket sous genererCertificatNavigateurWS : %O", socket.handshake)
    const session = socket.handshake.session
    const comptesUsagers = socket.comptesUsagers

    // Valider l'existence du compte et verifier si on a un compte special (e.g. proprietaire)
    const compteUsager = await comptesUsagers.chargerCompte(nomUsager)
    debug("Info usager charge : %O", compteUsager)
    if(!compteUsager) {
      throw new Error("Compte usager inconnu : " + nomUsager)
    }

    var challengeServeur = socket[CONST_WEBAUTHN_CHALLENGE]
    debug("Information authentifierWebauthn :\nchallengeServeur: %O", challengeServeur)

    const {demandeCertificat} = params
    const resultatWebauthn = await verifierChallenge(challengeServeur, compteUsager, params.webauthn, {demandeCertificat})

    debug("Resultat verification webauthn: %O", resultatWebauthn)
    if(resultatWebauthn.authentifie !== true) throw new Error("Signature UAF de la demande de certificat est incorrecte")

    debug("Usager : nomUsager=%s, userId=%s", nomUsager, userId)

    const challengeAttestion = resultatWebauthn.assertionExpectations.challenge,
          origin = resultatWebauthn.assertionExpectations.origin
    const challengeAjuste = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(challengeAttestion)))

    const clientAssertionResponse = webauthnResponseBytesToMultibase(params.webauthn)

    const commandeSignature = {
      userId: compteUsager.userId,
      demandeCertificat,
      challenge: challengeAjuste,
      origin,
      clientAssertionResponse,
    }
    const domaine = 'CoreMaitreDesComptes'
    const action = 'signerCompteUsager'
    debug("Commande de signature de certificat %O", commandeSignature)
    const reponseCertificat = await amqpdao.transmettreCommande(domaine, commandeSignature, {action, ajouterCertificat: true})
    debug("genererCertificatNavigateurWS: Reponse demande certificat pour usager : %O", reponseCertificat)

    return reponseCertificat
  } else {
    throw new Error("Erreur, le socket n'est pas en mode protege")
  }

}

async function getCertificatsMaitredescles(socket, cb) {
  const maitreClesDao = socket.handshake.maitreClesDao
  const reponse = await maitreClesDao.getCertificatsMaitredescles()
  debug("Reponse getCertificatsMaitredescles:\n%O", reponse)
  cb(reponse)
}

async function sauvegarderCleDocument(socket, transaction, cb) {
  const comptesUsagers = socket.handshake.comptesUsagers
  const reponse = await comptesUsagers.relayerTransaction(transaction)
  cb(reponse)
}

async function ecouterFingerprintPk(socket, params) {
  const fingerprintPk = params.fingerprintPk
  // Associer socket au fingerprint
  const roomName = `fingerprintPk/${fingerprintPk}`
  debug("Socket %s join room %s", socket.id, roomName)
  socket.join(roomName)
  return
}

async function authentifierCertificat(socket, params) {
  const idmg = socket.amqpdao.pki.idmg,
        certCa = socket.amqpdao.pki.ca

  var challengeServeur = socket[CONST_CHALLENGE_CERTIFICAT]
  const chainePem = params['_certificat']

  debug("Information authentifierCertificat :\nchallengeSession: %O\nparams: %O",
    challengeServeur, params)

  const reponse = await verifierSignatureCertificat(idmg, chainePem, challengeServeur, params, {certCa})
  if(reponse.valide !== true) {return {err: 'Signature invalide'}}

  debug("Reponse verifier signature certificat : %O", reponse)

  // Verifier si c'est une reconnexion - la session existe et est valide (auth multiples)
  const session = socket.handshake.session
  const auth = session.auth
  let userId = session.userId,
      delegations_version = null

  // Pour permettre l'authentification par certificat, le compte usager ne doit pas
  // avoir de methodes webauthn ou la session doit deja etre verifiee.
  if(userId && auth) {
    // On a une session existante. S'assurer qu'elle est verifiee (score 2 ou plus)
    const scoreAuth = calculerScoreVerification(auth) // Object.values(auth).reduce((score, item)=>{return score + item}, 0)
    if(scoreAuth < 2) {
      return {
        err: 'Le compte doit etre verifie manuellement',
        authentifie: false,
      }
    }
  }

  var facteurAssociationCleManquante = false
  const infoUsager = await socket.comptesUsagersDao.chargerCompte(reponse.nomUsager)
  debug("Compte usager recu : %O", infoUsager)

  if(!userId){
    // On n'a pas de session existante. Verifier si le compte a au moins une
    // methode de verification forte.
    userId = infoUsager.userId

    // Verifier si le certificat est nouvellement active - peut donner un facteur
    // de verification additionnel (e.g. pour activer une premiere cle)
    // const fingerprintPk = await calculerFingerprintPkCert(chainePem[0])
    const fingerprintPk = await fingerprintPublicKeyFromCertPem(chainePem[0])
    const activations = infoUsager.activations_par_fingerprint_pk || {},
          activationCert = activations[fingerprintPk] || {}
    if(activationCert.associe === false) {
      // Le certificat n'est pas encore associe a une cle, on ajoute un facteur
      // de verification pour cet appareil
      facteurAssociationCleManquante = true
    }

    if(!facteurAssociationCleManquante) {
      const webauthn = infoUsager.webauthn || {}
      if(Object.keys(webauthn).length !== 0) {
        return {
          err: 'Le compte est protege par authentification forte',
          authentifie: false,
        }
      }
    }
  }

  if(userId !== reponse.userId) {
    return {
      err: `UserId du certificat ${reponse.userId} ne correspond pas au compte dans la base de donnees ou la session (${userId})`,
      authentifie: false,
    }
  }

  debug("Reponse verifier signature certificat : %O", reponse)
  if(reponse.valide === true) {
    // Authentification reussie avec le certificat. Preparer la session.
    if(!auth) {
      // C'est une nouvelle authentification, avec une nouvelle session
      const headers = socket.handshake.headers,
            ipClient = headers['x-forwarded-for']

      session.userId = reponse.userId
      session.nomUsager = reponse.nomUsager
      session.auth = {'certificat': 1}
      if(facteurAssociationCleManquante) {
        // Flag special, le certificat de l'appareil a ete active manuellement
        // et aucune cle n'a encore ete associee a cet appareil.
        session.auth.associationCleManquante = 1
      } else {
        // Flag special, aucune autre methode disponible
        session.auth.methodeunique = 1
      }
      session.ipClient = ipClient
      session.save()

      // Associer listeners prives - si c'est une reconnexion, ils sont deja actifs
      socket.activerListenersPrives()
    }

    debug("Session: %O", session)

    // Verifier si le score d'authentification > 1
    const scoreVerification = calculerScoreVerification(session.auth)
    if(scoreVerification > 1) {
      socket.activerModeProtege()
    }

    debug("Socket events apres (re)connexion: %O", Object.keys(socket._events))

    // Repondre au client
    return {
      idmg: reponse.idmg,
      valide: reponse.valide,
      userId: reponse.userId,
      nomUsager: reponse.nomUsager,
      authentifie: true,
    }
  }

  return {valide: false, err: 'Acces refuse'}
}

async function authentifierCleMillegrille(socket, params) {
  const idmg = socket.amqpdao.pki.idmg,
        certCa = socket.amqpdao.pki.caForge  // Certificat de MilleGrille local (le CA)

  var challengeServeur = socket[CONST_CHALLENGE_CERTIFICAT]
  // const chainePem = params['_certificat']

  debug("Information authentifierCleMillegrille :\nchallengeSession: %O\nparams: %O",
    challengeServeur, params)

  const reponse = await verifierSignatureMillegrille(certCa, challengeServeur, params)
  // const reponse = await verifierSignatureCertificat(idmg, [certCa], challengeServeur, params)
  debug("Reponse verifier signature certificat de millegrille : %O", reponse)
  if(reponse.valide !== true) {return {err: 'Signature invalide'}}

  const nomUsager = params.nomUsager

  // Verifier si c'est une reconnexion - la session existe et est valide (auth multiples)
  const session = socket.handshake.session
  const auth = session.auth
  let userId = session.userId

  if(reponse.valide === true) {
    // Authentification reussie avec le certificat. Preparer la session.

    if(!userId){
      // On n'a pas de session existante. Charger l'information usager (pour le userId).
      const infoUsager = await socket.comptesUsagersDao.chargerCompte(nomUsager)
      userId = infoUsager.userId
    }

    if(params.activerDelegation) {
      debug("Activer la delegation globale proprietaire sur le compte %s", nomUsager)
      const confirmation = await socket.comptesUsagersDao.activerDelegationParCleMillegrille(userId, params)
      if(!confirmation || confirmation.err) {
        debug("Erreur activation de la delegation sur le compte %s", nomUsager)
      }
    }

    if(!auth) {
      // C'est une nouvelle authentification, avec une nouvelle session
      const headers = socket.handshake.headers,
            ipClient = headers['x-forwarded-for']

      session.userId = userId
      session.nomUsager = nomUsager
      session.auth = {
        'certificatMillegrille': 2,  // Flag special
      }
      session.ipClient = ipClient
      session.save()

      // Associer listeners prives
      socket.activerListenersPrives()
    } else {
      // S'assurer d'ajouter la cle de millegrille comme methode d'authentification
      session.auth = {
        ...auth,
        'certificatMillegrille': 2,  // Flag special
      }
      session.save()
    }

    if(!socket.modeProtege) {
      // S'assurer que le modeProtege est actif (auth = cle de millegrille)
      socket.activerModeProtege()
    }

    debug("Session: %O\nSocket events apres (re)connexion %O", session, Object.keys(socket._events))

    // Repondre au client
    return {
      idmg,
      valide: reponse.valide,
      userId: userId,
      nomUsager: nomUsager,
      authentifie: true,
    }
  }

  return {valide: false, err: 'Acces refuse'}
}

async function authentifierWebauthn(socket, params) {
  const amqpdao = socket.amqpdao,
        idmg = amqpdao.pki.idmg

  var challengeServeur = socket[CONST_WEBAUTHN_CHALLENGE]
  debug("Information authentifierWebauthn :\nchallengeServeur: %O\nparams: %O",
    challengeServeur, params)

  // Pour permettre l'authentification par certificat, le compte usager ne doit pas
  // avoir de methodes webauthn
  const infoUsager = await socket.comptesUsagersDao.chargerCompte(params.nomUsager)
  debug("Info usager charge : %O", infoUsager)

  const {demandeCertificat} = params
  const resultatWebauthn = await verifierChallenge(challengeServeur, infoUsager, params.webauthn, {demandeCertificat})

  debug("Resultat verification webauthn: %O", resultatWebauthn)
  if(resultatWebauthn.authentifie === true) {
    const session = socket.handshake.session

    // Mettre 2 par defaut, permet d'acceder direct avec un seul token webauthn
    let nombreVerifications = 2
    if(resultatWebauthn.userVerification) {
      // Facteur supplementaire utilise pour verifier l'usager (PIN, biometrique)
      // Ajouter flags dans la session
      nombreVerifications++
    }
    const id64 = params.webauthn.id64  // Utiliser id unique de l'authentificateur
    const verifications = {
      [`webauthn.${id64}`]: nombreVerifications
    }

    // Verifier si le message d'authentification est signe par le certificat client
    if(params.signatureCertificat) {
      try {
        debug("Verification de la signature du certificat : %O", params.signatureCertificat)
        const resultatVerificationMessage = await socket.amqpdao.pki.verifierMessage(params.signatureCertificat)
        debug("Verification signature message webauthn %O", resultatVerificationMessage)
        if(resultatVerificationMessage[1] === true) {
          verifications.certificat = 1
        }
      } catch(err) {console.warn("appSocketIo.authentifierWebauthn WARN Erreur verification certificat : %O", err)}
    }

    let certificat = null
    if(demandeCertificat) {
      // La verification du challenge avec demandeCertificat est OK, on passe
      // la requete au MaitreDesComptes
      // Extraire challenge utilise pour verifier la demande de certificat
      const challengeAttestion = resultatWebauthn.assertionExpectations.challenge,
            origin = resultatWebauthn.assertionExpectations.origin
      const challengeAjuste = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(challengeAttestion)))

      const clientAssertionResponse = webauthnResponseBytesToMultibase(params.webauthn)

      const commandeSignature = {
        userId: infoUsager.userId,
        demandeCertificat,
        challenge: challengeAjuste,
        origin,
        clientAssertionResponse,
      }
      const domaine = 'CoreMaitreDesComptes'
      const action = 'signerCompteUsager'

      debug("Commande de signature de certificat %O", commandeSignature)
      const reponseCertificat = await amqpdao.transmettreCommande(domaine, commandeSignature, {action, ajouterCertificat: true})
      debug("authentifierWebauthn Reponse demande certificat pour usager : %O", reponseCertificat)
      certificat = reponseCertificat.certificat
    }

    if(!session.auth) {
      // Nouvelle session, associer listeners prives
      socket.activerListenersPrives()
    }

    // Mettre a jour la session
    const headers = socket.handshake.headers,
          ipClient = headers['x-forwarded-for']
    session.nomUsager = params.nomUsager
    session.userId = infoUsager.userId
    session.ipClient = ipClient
    session.auth = {...session.auth, ...verifications}
    session.save()

    if(!socket.modeProtege) {
      let scoreVerification = calculerScoreVerification(session.auth)
      if(scoreVerification > 1) {
        debug("Score de verification %d, on active mode protege automatiquement", scoreVerification)
        socket.activerModeProtege()
      }
    }

    debug("Etat session usager apres login webauthn : %O", session)

    return {idmg, ...infoUsager, auth: session.auth, certificat}
  }

  return false
}

async function ajouterCsrRecovery(socket, params) {
  
}

function calculerScoreVerification(auth) {
  return Object.values(auth).reduce((compteur, item)=>{
    return compteur + item
  }, 0)
}

async function traiterCompteUsagersDao(socket, methode, {params, cb}) {
  try {
    const comptesUsagersDao = socket.comptesUsagersDao
    const reponse = await comptesUsagersDao[methode](socket, params)
    if(cb) cb(reponse)
  } catch(err) {
    debug("traiterCompteUsagersDao ERROR %O", err)
    cb({ok: false, err: "Erreur serveur : " + err})
  }
}

module.exports = {
  init, configurerEvenements,
}
