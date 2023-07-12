// Gestion evenements socket.io pour /millegrilles
const debug = require('debug')('appSocketIo');
const multibase = require('multibase')
// const { fingerprintPublicKeyFromCertPem } = require('@dugrema/millegrilles.utiljs/src/certificats')
const { upgradeProteger, authentification, webauthn } = require('@dugrema/millegrilles.nodejs')
const { fingerprintPublicKeyFromCertPem } = require('@dugrema/millegrilles.nodejs/src/certificats')

const { MESSAGE_KINDS } = require('@dugrema/millegrilles.utiljs/src/constantes')
const { extraireExtensionsMillegrille } = require('@dugrema/millegrilles.utiljs/src/forgecommon')

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

const CONST_DOMAINE_MAITREDESCOMPTES = 'CoreMaitreDesComptes'

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
      // {eventName: 'ecouterFingerprintPk', callback: async (params, cb) => {wrapCb(ecouterFingerprintPk(socket, params), cb)}},
      {eventName: 'authentifierCertificat', callback: async (params, cb) => {wrapCb(authentifierCertificat(socket, params), cb)}},
      {eventName: 'upgrade', callback: async (params, cb) => {wrapCb(authentifierCertificat(socket, params), cb)}},
      {eventName: 'authentifierWebauthn', callback: async (params, cb) => {wrapCb(authentifierWebauthn(socket, params), cb)}},
      {eventName: 'authentifierCleMillegrille', callback: async (params, cb) => {wrapCb(authentifierCleMillegrille(socket, params), cb)}},
      {eventName: 'ajouterCsrRecovery', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'ajouterCsrRecovery', {params, cb})}},

      // Listeners evenements
      {eventName: 'ecouterEvenementsActivationFingerprint', callback: (params, cb) => {
        ecouterEvenementsActivationFingerprint(socket, params, cb)
      }},
      {eventName: 'retirerEvenementsActivationFingerprint', callback: (params, cb) => {
        retirerEvenementsActivationFingerprint(socket, params, cb)
      }},

    ],
    listenersPrives: [
      {eventName: 'changerApplication', callback: (params, cb) => {changerApplication(socket, params, cb)}},
      {eventName: 'subscribe', callback: (params, cb) => {subscribe(socket, params, cb)}},
      {eventName: 'unsubscribe', callback: (params, cb) => {unsubscribe(socket, params, cb)}},
      {eventName: 'getCertificatsMaitredescles', callback: cb => {getCertificatsMaitredescles(socket, cb)}},
      {eventName: 'upgradeProteger', callback: async (params, cb) => {wrapCb(upgradeProteger(socket, params), cb)}},
    ],
    listenersProteges: [
      {eventName: 'challengeAjoutWebauthn', callback: async cb => {wrapCb(challengeAjoutWebauthn(socket), cb)}},
      {eventName: 'ajouterCleWebauthn', callback: async (params, cb) => {wrapCb(ajouterWebauthn(socket, params), cb)}},
      {eventName: 'sauvegarderCleDocument', callback: (params, cb) => {sauvegarderCleDocument(socket, params, cb)}},
      {eventName: 'topologie/listeApplicationsDeployees', callback: async (params, cb) => {wrapCb(listeApplicationsDeployees(socket, params), cb)}},
      // {eventName: 'genererCertificatNavigateur', callback: async (params, cb) => {
      //   wrapCb(genererCertificatNavigateurWS(socket, params), cb)
      // }},
      {
        eventName: 'activerDelegationParCleMillegrille', 
        callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'activerDelegationParCleMillegrille', {params, cb})}
      },
      {
        eventName: 'chargerCompteUsager', 
        callback: async (params, cb) => {
          traiterCompteUsagersDao(socket, 'chargerCompteUsager', {params, cb})
        }
      },
      {eventName: 'getRecoveryCsr', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'getRecoveryCsr', {params, cb})}},
      {eventName: 'signerRecoveryCsr', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'signerRecoveryCsr', {params, cb})}},
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
  promise.then(reponse=>{
    if(reponse['__original']) {
      cb(reponse['__original'])
    } else {
      cb(reponse)
    }
  })
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

  const resultatVerificationMessage = await socket.amqpdao.pki.verifierMessage(params)
  debug("ajouterWebauthn Resultat validation params : ", resultatVerificationMessage)
  if(resultatVerificationMessage.valide !== true) {
    debug("ajouterWebauthn Demande ajout signature message invalide - rejete")
    return false
  }

  const certificat = resultatVerificationMessage.certificat || {}
  let extensions = {}
  if(certificat.extensions) {
    extensions = extraireExtensionsMillegrille(certificat)
  }

  const comptesUsagers = socket.comptesUsagersDao,
        hostname = socket.hostname
  const session = socket.handshake.session
  const nomUsager = session.nomUsager

  debug("ajouterWebauthn Demande ajout signature pour certificat : %O (session: %O)", extensions, session)

  const nomUsagerCertificat = certificat.subject.getField('CN').value,
        userIdCertificat = extensions.userId

  // S'assurer que la session et le certificat utilise pour signer correspondent
  if(userIdCertificat !== session.userId | nomUsagerCertificat !== nomUsager) {
    debug("Mismatch session/certificat pour nomUsager ou userId")
    return false
  }

  // debug(session)
  const contenu = JSON.parse(params.contenu)

  const {desactiverAutres, reponseChallenge, fingerprintPk, hostname: hostname_params} = contenu

  // S'assurer que :
  //  - le socket est en mode protege; ou
  //  - l'enregistrement est pour une activation de fingerprint_pk valide
  var demandeAutorisee = false
  if( socket.modeProtege ) {
    demandeAutorisee = true
  } else if(fingerprintPk) {
    const compteUsager = await comptesUsagers.chargerCompte(session.nomUsager)
    debug("Compte usager, activer par fingerprintPk: %s : %O", fingerprintPk, compteUsager)
    // if(compteUsager.activations_par_fingerprint_pk) {
    if(compteUsager.activations) {
      // const infoActivation = compteUsager.activations_par_fingerprint_pk[fingerprintPk]
      const infoActivation = compteUsager.activations[fingerprintPk]
      // if(infoActivation.associe === false) {
      if(infoActivation) {
        demandeAutorisee = true
      }
    }
  }

  if( ! demandeAutorisee ) {
    debug("Demande d'enregistrement webauthn refusee")
    return false
  }

  try {
    // const attestationExpectations = socket.attestationExpectations
    // const informationCle = await validerRegistration(reponseChallenge, attestationExpectations)

    // const opts = {reset_cles: desactiverAutres, fingerprint_pk: fingerprintPk, hostname: hostname_params}

    // debug("Challenge registration OK pour usager %s, info: %O", nomUsager, informationCle)

    // const tokenSession = session.tokenSession
    // if(!tokenSession) {
    //   return {ok: false, code: 20, err: "Token d'autorisation absent (serveur web maitrecomptes)"}
    // }

    const reponse = await comptesUsagers.ajouterCle(params)
    debug("Reponse ajout compte usager: ", reponse)
    if(reponse.ok === false || reponse.code) {
      return reponse
    }

    // Trigger l'upgrade proteger
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

  const infoUsager = await socket.comptesUsagersDao.chargerCompte(nomUsager)
  debug("Compte usager recu : %O", infoUsager)
  const challenge = infoUsager.registration_challenge
  debug("Registration challenge : %O", challenge)

  return challenge
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

// async function genererCertificatNavigateurWS(socket, params) {
//   debug("Generer certificat navigateur, params: %O", params)
//   const session = socket.handshake.session,
//         amqpdao = socket.amqpdao

//   const nomUsager = session.nomUsager,
//         userId = session.userId
//   const modeProtege = socket.modeProtege

//   if(modeProtege) {
//     // debug("Handshake du socket sous genererCertificatNavigateurWS : %O", socket.handshake)
//     const session = socket.handshake.session
//     const comptesUsagers = socket.comptesUsagers

//     // Valider l'existence du compte et verifier si on a un compte special (e.g. proprietaire)
//     const compteUsager = await comptesUsagers.chargerCompte(nomUsager)
//     debug("Info usager charge : %O", compteUsager)
//     if(!compteUsager) {
//       throw new Error("Compte usager inconnu : " + nomUsager)
//     }

//     var challengeServeur = socket[CONST_WEBAUTHN_CHALLENGE]
//     debug("Information authentifierWebauthn :\nchallengeServeur: %O", challengeServeur)

//     const {demandeCertificat} = params
//     const resultatWebauthn = await verifierChallenge(challengeServeur, compteUsager, params.webauthn, {demandeCertificat})

//     debug("Resultat verification webauthn: %O", resultatWebauthn)
//     if(resultatWebauthn.authentifie !== true) throw new Error("Signature UAF de la demande de certificat est incorrecte")

//     debug("Usager : nomUsager=%s, userId=%s", nomUsager, userId)

//     const challengeAttestion = resultatWebauthn.assertionExpectations.challenge,
//           origin = resultatWebauthn.assertionExpectations.origin
//     const challengeAjuste = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(challengeAttestion)))

//     const clientAssertionResponse = webauthnResponseBytesToMultibase(params.webauthn)

//     const commandeSignature = {
//       userId: compteUsager.userId,
//       demandeCertificat,
//       challenge: challengeAjuste,
//       origin,
//       clientAssertionResponse,
//     }
//     const domaine = 'CoreMaitreDesComptes'
//     const action = 'signerCompteUsager'
//     debug("Commande de signature de certificat %O", commandeSignature)
//     const reponseCertificat = await amqpdao.transmettreCommande(domaine, commandeSignature, {action, ajouterCertificat: true})
//     debug("genererCertificatNavigateurWS: Reponse demande certificat pour usager : %O", reponseCertificat)

//     return reponseCertificat
//   } else {
//     throw new Error("Erreur, le socket n'est pas en mode protege")
//   }

// }

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
        certCa = socket.amqpdao.pki.ca,
        session = socket.handshake.session

  // debug("authentifierCertificat SESSION (1) %O", session)

  var challengeServeur = socket[CONST_CHALLENGE_CERTIFICAT]
  const chainePem = params['certificat']
  // const contenu = JSON.parse(params.contenu)

  debug("Information authentifierCertificat :\nchallengeSession: %O\nparams: %O",
    challengeServeur, params)

  const reponse = await verifierSignatureCertificat(idmg, chainePem, challengeServeur, params, {certCa})
  if(reponse.valide !== true) {return {err: 'Signature invalide'}}

  debug("Reponse verifier signature certificat : %O", reponse)

  // Verifier si c'est une reconnexion - la session existe et est valide (auth multiples)
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
  const compteUsager = infoUsager.compte

  if(!userId){
    // On n'a pas de session existante. Verifier si le compte a au moins une
    // methode de verification forte.
    userId = compteUsager.userId

    // Verifier si le certificat est nouvellement active - peut donner un facteur
    // de verification additionnel (e.g. pour activer une premiere cle)
    // const fingerprintPk = await calculerFingerprintPkCert(chainePem[0])
    const fingerprintPk = await fingerprintPublicKeyFromCertPem(chainePem[0])
    const activations = infoUsager.activations || {},  // infoUsager.activations_par_fingerprint_pk || {},
          activationCert = activations[fingerprintPk] || {}
    // if(activationCert.associe === false) {
    if(activationCert) {
      // Le certificat n'est pas encore associe a une cle, on ajoute un facteur
      // de verification pour cet appareil
      debug("Activation certificat valide pour fingerprint %s", fingerprintPk)
      facteurAssociationCleManquante = true
    }

    if(!facteurAssociationCleManquante) {
      const webauthn = infoUsager.webauthn || {}
      if(Object.keys(webauthn).length !== 0) {
        return {
          err: 'Le compte est protege par authentification forte',
          authentifie: false,
        }
      } else {
        return {
          err: "Aucune methode d'authentification n'est disponible (fingerprint inactif, webahtn vide)",
          authentifie: false,
        }
      }
    } else {
      debug("On permet la creation de session userId %s via fingperint %s", userId, fingerprintPk)
    }
  }

  // debug("authentifierCertificat SESSION (2) %O", session)

  if(userId !== reponse.userId) {
    return {
      err: `UserId du certificat ${reponse.userId} ne correspond pas au compte dans la base de donnees ou la session (${userId})`,
      authentifie: false,
    }
  }

  // debug("authentifierCertificat SESSION (3) %O", session)

  debug("Reponse verifier signature certificat : %O", reponse)
  if(reponse.valide === true) {
    // Authentification reussie avec le certificat. Preparer la session.

    if(!auth) {
      // C'est une nouvelle authentification, avec une nouvelle session
      const headers = socket.handshake.headers,
            ipClient = headers['x-forwarded-for']

      // debug("authentifierCertificat SESSION (4) %O", session)

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

      // debug("authentifierCertificat SESSION (5) %O", session)

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
      delegation_globale: infoUsager.delegation_globale,
      delegations_date: infoUsager.delegations_date,
      delegations_version: infoUsager.delegations_version,
    }
  }

  return {valide: false, err: 'Acces refuse'}
}

async function authentifierCleMillegrille(socket, params) {
  const idmg = socket.amqpdao.pki.idmg,
        certCa = socket.amqpdao.pki.caForge  // Certificat de MilleGrille local (le CA)

  var challengeServeur = socket[CONST_CHALLENGE_CERTIFICAT]
  // const chainePem = params['certificat']

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
        pki = amqpdao.pki, 
        idmg = pki.idmg

  const session = socket.handshake.session
  const userId = session.userId,
        passkey_authentication = session.passkey_authentication

  if(!passkey_authentication) return {ok: false, err: "Session absente (passkey_authentication)"}

  // var challengeServeur = socket[CONST_WEBAUTHN_CHALLENGE]
  const challenge = passkey_authentication.ast.challenge
  debug("Information authentifierWebauthn :\nchallengeServeur: %O\nparams: %O", challenge, params)

  // Pour permettre l'authentification par certificat, le compte usager ne doit pas
  // avoir de methodes webauthn
  const contenuParams = params.contenu?JSON.parse(params.contenu):params
  // const infoUsager = await socket.comptesUsagersDao.chargerCompte(contenuParams.nomUsager)
  // debug("Info usager charge : %O", infoUsager)

  const {demandeCertificat} = contenuParams
  // const resultatWebauthn = await verifierChallenge(challengeServeur, infoUsager, contenuParams.webauthn, {demandeCertificat})
  const resultatWebauthn = await socket.comptesUsagersDao.authentifierWebauthn(socket, params, challenge)

  debug("Resultat verification webauthn: %O", resultatWebauthn)
  if(resultatWebauthn.ok === true) {
    // Mettre 2 par defaut, permet d'acceder direct avec un seul token webauthn
    let nombreVerifications = 2
    if(resultatWebauthn.userVerification) {
      // Facteur supplementaire utilise pour verifier l'usager (PIN, biometrique)
      // Ajouter flags dans la session
      nombreVerifications++
    }
    const id64 = contenuParams.webauthn.id64  // Utiliser id unique de l'authentificateur
    const verifications = {
      [`webauthn.${id64}`]: nombreVerifications
    }

    // Verifier si le message d'authentification est signe par le certificat client
    if(contenuParams.signatureCertificat) {
      try {
        debug("Verification de la signature du certificat : %O", contenuParams.signatureCertificat)
        const resultatVerificationMessage = await socket.amqpdao.pki.verifierMessage(contenuParams.signatureCertificat)
        debug("Verification signature message webauthn %O", resultatVerificationMessage)
        if(resultatVerificationMessage[1] === true) {
          verifications.certificat = 1
        }
      } catch(err) {console.warn("appSocketIo.authentifierWebauthn WARN Erreur verification certificat : %O", err)}
    }

    const certificat = resultatWebauthn.certificat
    // if(demandeCertificat) {
    //   // La verification du challenge avec demandeCertificat est OK, on passe
    //   // la requete au MaitreDesComptes
    //   // Extraire challenge utilise pour verifier la demande de certificat
    //   const challengeAttestion = resultatWebauthn.assertionExpectations.challenge,
    //         origin = resultatWebauthn.assertionExpectations.origin
    //   const challengeAjuste = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(challengeAttestion)))

    //   const clientAssertionResponse = webauthnResponseBytesToMultibase(contenuParams.webauthn)

    //   const commandeSignature = {
    //     // userId: infoUsager.userId,
    //     userId,
    //     demandeCertificat,
    //     challenge: challengeAjuste,
    //     origin,
    //     clientAssertionResponse,
    //   }
    //   const domaine = 'CoreMaitreDesComptes'
    //   const action = 'signerCompteUsager'

    //   debug("Commande de signature de certificat %O", commandeSignature)
    //   const reponseCertificat = await amqpdao.transmettreCommande(domaine, commandeSignature, {action, ajouterCertificat: true})
    //   debug("authentifierWebauthn Reponse demande certificat pour usager : %O", reponseCertificat)
    //   certificat = reponseCertificat.certificat
    // }

    // debug("Get token session pour %O", contenuParams)
    // const challengeAttestion = resultatWebauthn.assertionExpectations.challenge
    // const challengeAjuste = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(challengeAttestion)))    
    // const requeteToken = {
    //   userId: infoUsager.userId,
    //   nomUsager: contenuParams.nomUsager,
    //   webauthn: contenuParams.webauthn,
    //   challenge: challengeAjuste,
    // }
    // const reponseTokenSession = await amqpdao.transmettreRequete(
    //   CONST_DOMAINE_MAITREDESCOMPTES, 
    //   requeteToken, 
    //   {action: 'getTokenSession', ajouterCertificat: true}
    // )
    // debug("Token session recu : ", reponseTokenSession)
    // const tokenSigne = reponseTokenSession['__original']
    // delete tokenSigne.certificat
    // session.tokenSession = tokenSigne

    const infoUsager = await socket.comptesUsagersDao.chargerCompte(contenuParams.nomUsager)
    debug("Info usager charge : %O", infoUsager)
    const compteUsager = infoUsager.compte

    if(!session.auth) {
      // Nouvelle session, associer listeners prives
      socket.activerListenersPrives()
    }

    // Mettre a jour la session
    const headers = socket.handshake.headers,
          ipClient = headers['x-forwarded-for']
    session.nomUsager = contenuParams.nomUsager
    // session.userId = infoUsager.userId
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

    const reponse = {
      ...compteUsager,
      userId,
      idmg, 
      auth: session.auth, 
      certificat, 
      sig: null, 
      '__original': null
    }
    delete reponse['__original']
    delete reponse['sig']
    delete reponse['certificat']
    if(certificat) reponse.certificat = certificat

    debug("authentifierWebauthn Reponse ", reponse)
    const reponseFormattee = await pki.formatterMessage(MESSAGE_KINDS.KIND_REPONSE, reponse, {ajouterCertificat: true})

    return reponseFormattee
  }

  return false
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
    if(cb) cb({ok: false, err: "Erreur serveur : " + err})
  }
}

// Enregistrement d'evenements

const CONST_ROUTINGKEYS_ACTIVATION_FINGERPRINT = ['evenement.CoreMaitreDesComptes.activationFingerprintPk']

const mapperActivationFingerprint = {
  exchanges: ['2.prive'],
  routingKeyTest: /^evenement\.CoreMaitreDesComptes\.activationFingerprintPk$/,
  mapRoom: (message, _rk, _exchange) => {
    const fingerprintPk = message.fingerprint_pk
    if(fingerprintPk) {
      return `2.prive/evenement.CoreMaitreDesComptes.activationFingerprintPk/${fingerprintPk}`
    }
  }
}

function ecouterEvenementsActivationFingerprint(socket, params, cb) {
  const fingerprintPk = params.fingerprintPk
  const opts = { 
    routingKeys: CONST_ROUTINGKEYS_ACTIVATION_FINGERPRINT,
    exchanges: ['2.prive'],
    roomParam: fingerprintPk,
    mapper: mapperActivationFingerprint,
  }

  debug("ecouterEvenementsActivationFingerprint : %O", opts)
  socket.subscribe(opts, cb)
}

function retirerEvenementsActivationFingerprint(socket, params, cb) {
  const fingerprintPk = params.fingerprintPk
  const opts = { 
    routingKeys: CONST_ROUTINGKEYS_ACTIVATION_FINGERPRINT, 
    exchanges: ['2.prive'],
    roomParam: fingerprintPk,
  }
  debug("retirerEvenementsActivationFingerprint sur %O", opts)
  socket.unsubscribe(opts, cb)
}


module.exports = {
  init, configurerEvenements,
}
