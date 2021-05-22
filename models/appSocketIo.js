// Gestion evenements socket.io pour /millegrilles
const debug = require('debug')('millegrilles:maitrecomptes:appSocketIo');
const randomBytes = require('randombytes')
// const { pbkdf2 } = require('pbkdf2')
// const {
//     parseRegisterRequest,
//     generateRegistrationChallenge,
//     parseLoginRequest,
//     generateLoginChallenge,
//     verifyAuthenticatorAssertion,
// } = require('@webauthn/server');
const {
    splitPEMCerts, chargerClePrivee, chiffrerPrivateKey,
    verifierChallengeCertificat, validerChaineCertificats,
  } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { genererCSRIntermediaire, genererCertificatNavigateur, genererKeyPair
  } = require('@dugrema/millegrilles.common/lib/cryptoForge')
const { hacherPasswordCrypto } = require('@dugrema/millegrilles.common/lib/hachage')
const {
  genererChallengeWebAuthn, auditMethodes, upgradeProteger
} = require('@dugrema/millegrilles.common/lib/authentification')
const validateurAuthentification = require('../models/validerAuthentification')
const multibase = require('multibase')

const {
  init: initWebauthn,
  genererChallengeRegistration,
  verifierChallengeRegistration,
  genererRegistrationOptions,
  validerRegistration,
} = require('@dugrema/millegrilles.common/lib/webauthn')

const PBKDF2_KEYLEN = 64,
      PBKDF2_HASHFUNCTION = 'sha512'

const CONST_WEBAUTHN_CHALLENGE = 'webauthnChallenge',
      CONST_AUTH_PRIMAIRE = 'authentificationPrimaire',
      CONST_CERTIFICAT_AUTH_CHALLENGE = 'certAuthChallenge'


function init(hostname, idmg) {
  initWebauthn(hostname,idmg)
}

function configurerEvenements(socket) {
  const configurationEvenements = {
    listenersPrives: [
      {eventName: 'disconnect', callback: _=>{deconnexion(socket)}},
      // {eventName: 'downgradePrive', callback: params => {downgradePrive(socket, params)}},
      {eventName: 'getInfoIdmg', callback: (params, cb) => {getInfoIdmg(socket, params, cb)}},
      {eventName: 'changerApplication', callback: (params, cb) => {changerApplication(socket, params, cb)}},
      {eventName: 'subscribe', callback: (params, cb) => {subscribe(socket, params, cb)}},
      {eventName: 'unsubscribe', callback: (params, cb) => {unsubscribe(socket, params, cb)}},
      {eventName: 'getCertificatsMaitredescles', callback: cb => {getCertificatsMaitredescles(socket, cb)}},
      {eventName: 'genererChallengeWebAuthn', callback: async (params, cb) => {
        debug('genererChallengeWebAuthn %O', params)
        cb(await genererChallengeWebAuthn(socket, params))
      }},
      {eventName: 'upgradeProteger', callback: async (params, cb) => {cb(await upgradeProteger(socket, params))}},
      {eventName: 'maitredescomptes/challengeAjoutWebauthn', callback: async cb => {cb(await challengeAjoutWebauthn(socket))}},
      {eventName: 'maitredescomptes/ajouterWebauthn', callback: async (params, cb) => {cb(await ajouterWebauthn(socket, params))}},
    ],
    listenersProteges: [
      {eventName: 'sauvegarderCleDocument', callback: (params, cb) => {sauvegarderCleDocument(socket, params, cb)}},
      {eventName: 'maitredescomptes/genererKeyTotp', callback: (params, cb) => {genererKeyTotp(socket, params, cb)}},
      {eventName: 'maitredescomptes/sauvegarderSecretTotp', callback: (params, cb) => {sauvegarderSecretTotp(socket, params, cb)}},
      {eventName: 'associerIdmg', callback: params => {
        debug("Associer idmg")
      }},
      {eventName: 'maitredescomptes/changerMotDePasse', callback: async (params, cb) => {
        const timeout = setTimeout(() => {cb({'err': 'Timeout changerMotDePasse'})}, 7500)
        const resultat = await changerMotDePasse(socket, params)
        clearTimeout(timeout)
        cb({resultat})
      }},
      {eventName: 'desactiverWebauthn', callback: params => {
        debug("Desactiver webauthn")
        throw new Error("Not implemented")
      }},
      {eventName: 'desactiverMotdepasse', callback: params => {
        debug("Desactiver mot de passe")
        throw new Error("Not implemented")
      }},
      {eventName: 'genererCertificatNavigateur', callback: async (params, cb) => {
        cb(await genererCertificatNavigateurWS(socket, params))
      }},
    ],
    subscriptionsPrivees: [],
    subscriptionsProtegees: [],
  }

  return configurationEvenements
}

function deconnexion(socket) {
  debug("Deconnexion %s", socket.id)
}

function ajouterMotdepasse(req, res, next) {
  var infoCompteUsager = req.compteUsager

  // Verifier si un mot de passe existe deja
  if(infoCompteUsager.motdepasse) {
    debug("Mot de passe existe deja, il faut utiliser le formulaire de changement")
    return res.sendStatus(403);
  } else {
    const {motdepasseNouveau} = req.body
    var nomUsager = req.nomUsager

    const estProprietaire = req.sessionUsager.estProprietaire
    if(estProprietaire && req.body['nom-usager']) {
      nomUsager = req.body['nom-usager']
    }

    genererMotdepasse(motdepasseNouveau)
    .then(infoMotdepasse => {
      req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse, estProprietaire)
      if(estProprietaire) {
        // On modifie le nomUsager du proprietaire
        req.sessionUsager.nomUsager = nomUsager
      }
      return res.sendStatus(200)  // OK
    })
    .catch(err=>{
      console.error("Erreur hachage mot de passe")
      console.error(err)
      return res.sendStatus(500)
    })
  }

}

async function changerMotDePasse(socket, params) {
  const req = socket.handshake,
        session = req.session,
        comptesUsagers = socket.handshake.comptesUsagers

  // if( session.estProprietaire ) {
  if( ! socket.modeProtege ) {
    throw new Error("Le mot de passe ne peut etre change qu'en mode protege")
  }

  const nomUsager = socket.nomUsager

  // Note : le mot de passe est chiffre
  debug("Changer mot de passe %s : %O", nomUsager, params)

  const {commandeMaitredescles, transactionCompteUsager} = params

  // S'assurer qu'on a des transactions des bons types, pour le bon usager
  if( commandeMaitredescles['en-tete'].domaine !== 'MaitreDesCles.sauvegarderCle' ) {
    throw new Error("Transaction maitre des cles de mauvais type")
  } else if( commandeMaitredescles.identificateurs_document.champ !== 'motdepasse' ) {
    throw new Error("Transaction maitre des cles sur mauvais champ (doit etre motdepasse)")
  } else if( transactionCompteUsager['en-tete'].domaine !== 'MaitreDesComptes.majMotdepasse' ) {
    throw new Error("Transaction changement mot de passe est de mauvais type : " + transactionDocument['en-tete'].domaine)
  } else if( transactionCompteUsager.nomUsager !== nomUsager ) {
    throw new Error("Transaction changement mot de passe sur mauvais usager : " + nomUsager)
  }

  // Soumettre les transactions
  const amqpdao = socket.amqpdao
  const reponseMaitredescles = await amqpdao.transmettreCommande(
    commandeMaitredescles['en-tete'].domaine, commandeMaitredescles, {noformat: true})
  const reponseMotdepasse = await comptesUsagers.relayerTransaction(transactionCompteUsager)

  return {reponseMaitredescles, reponseMotdepasse}
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

  // Challenge via Socket.IO

  // const registrationRequest = u2f.request(MG_IDMG);
  // debug("Registration request, usager %s, hostname %s", nomUsager, hostname)
  // const challengeInfo = {
  //     relyingParty: { name: hostname },
  //     user: { id: nomUsager, name: nomUsager }
  // }
  // const registrationRequest = generateRegistrationChallenge(challengeInfo);
  // debug(registrationRequest)

  // return new Promise(async (resolve, reject)=>{
    // socket.emit('challengeRegistrationU2F', registrationRequest, async (reponse) => {
    //   debug("Reponse registration challenge")
    //   debug(reponse)

      // if(params.etat) {
      //   const credentials = params.credentials
        // const { key, challenge } = parseRegisterRequest(reponseChallenge);
        //
        // if( !key ) return cb(false)

        try {
          const sessionChallenge = socket.webauthnChallenge
          const informationCle = await validerRegistration(reponseChallenge, sessionChallenge)

          const nomUsager = session.nomUsager
          const opts = {desactiverAutres, fingerprint_pk: fingerprintPk}
          debug("Challenge registration OK pour usager %s, info: %O", nomUsager, informationCle)
          await comptesUsagers.ajouterCle(nomUsager, informationCle, opts)

          // Trigger l'upgrade proteger
          const methodeVerifiee = 'webauthn.' + informationCle.credId
          await upgradeProteger(socket, {nouvelEnregistrement: true, methodeVerifiee})

          return true
        } catch(err) {
          debug("ajouterWebauthn : erreur registration : %O", err)
        }
      // }
      // else {
      //   // Etat incorrect recu du client
      // }

      return false
    // })

  // })

  // return challengeCorrect

}

async function challengeAjoutWebauthn(socket) {
  debug('challengeAjoutWebauthn')

  const session = socket.handshake.session
  const nomUsager = session.nomUsager,
        userId = session.userId,
        hostname = socket.hostname

  // Challenge via Socket.IO

  // const registrationRequest = u2f.request(MG_IDMG);
  debug("Registration request, userId %s, usager %s, hostname %s", userId, nomUsager, hostname)
  // var userIdArray = new Uint8Array(String.fromCharCode.apply(null, multibase.decode(userId)))

  // const challengeInfo = {
  //     relyingParty: { name: hostname },
  //     user: { id: nomUsager, name: nomUsager }
  // }

  const registrationChallenge = await genererRegistrationOptions(userId, nomUsager)
  debug("Registration challenge : %O", registrationChallenge)

  // req.session[CONST_WEBAUTHN_CHALLENGE] = {
  //   challenge: registrationChallenge.challenge,
  //   userId: registrationChallenge.userId,
  //   nomUsager,
  // }

  // return res.send({
  //   challenge: registrationChallenge.attestation,
  // })
  //
  // const registrationRequest = await genererRegistrationOptions(challengeInfo)
  // debug(registrationRequest)

  socket.webauthnChallenge = registrationChallenge.challenge

  return registrationChallenge.attestation
}

function desactiverMotdepasse(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager

    // S'assurer qu'il y a des cles
    if(userInfo.cles && userInfo.cles.length > 0) {
      req.comptesUsagers.supprimerMotdepasse(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle webauthn, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

function desactiverWebauthn(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager
    const estProprietaire = req.sessionUsager.estProprietaire

    if(estProprietaire) {
      return res.sendStatus(403)  // Option non disponible pour le proprietaire
    }

    debug(userInfo)

    // S'assurer qu'il y a des cles
    if(userInfo.motdepasse) {
      req.comptesUsagers.supprimerCles(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle Webauthn, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

// async function upgradeProteger(socket, params) {
//   params = params || {}
//
//   const {methodesDisponibles, methodesUtilisees, nombreVerifiees} = await auditMethodes(
//     socket.handshake, params, {socket})
//   debug("Methode d'authentification disponibles : %O\nMethodes utilisees: %O",
//     methodesDisponibles, methodesUtilisees)
//
//   // debug("upgradeProteger, params : %O", params)
//   // const session = socket.handshake.session,
//   //       comptesUsagers = socket.comptesUsagers
//   //
//   // const infoCompte = await comptesUsagers.chargerCompte(session.nomUsager)
//   // const compteUsager = infoCompte.compteUsager
//   // const idmg = comptesUsagers.idmg
//   //
//   // debug("Info compte : %O\ncompteUsager : %O", infoCompte, compteUsager)
//
//   debug("Methode d'authentification disponibles : %O\nMethodes utilisees: %O", methodesDisponibles, methodesUtilisees)
//   const methodesValides = []
//   var authentificationValide = false, deuxiemeFacteur = null
//
//   if(nombreVerifiees >= 2) {
//     // On a deja 2 methodes verifiees
//     authentificationValide = true
//   } else if( methodesUtilisees.cleMillegrille && methodesUtilisees.cleMillegrille.verifie ) {
//     // Authentification avec cle de millegrille - donne acces avec 1 seul facteur
//     authentificationValide = true
//   } else {
//     // Verifier si on peut valider toutes les methodes utilisees
//     for(let methode in methodesUtilisees) {
//       const params = methodesUtilisees[methode]
//       if( ! params.verifie ) {
//         if(methode.startsWith('webauthn.')) {
//           resultat = {valide: false}
//         } else {
//           var resultat = null
//           switch(methode) {
//             case 'cleMillegrille': break
//             case 'tokenTotp': break
//             case 'motdepasse': break
//             case 'certificat':
//               resultat = await validateurAuthentification.verifierSignatureCertificat(
//                 idmg, compteUsager, params.certificat, params.challengeSession, params.valeur)
//               break
//           }
//         }
//
//         debug("Resultat verification : %O", resultat)
//         if(resultat.valide) {
//           params.verifie = true
//           deuxiemeFacteur = methode
//         }
//       }
//     }
//
//     // Verifier si on a au moins deux methodes verifiees
//     for(let methode in methodesUtilisees) {
//       const params = methodesUtilisees[methode]
//       if(params.verifie) {
//         methodesValides.push(methode)
//       }
//     }
//
//   }
//
//   debug("Methode valides : %O", methodesValides)
//
//   // Pour upgrade protege, permettre si on a 2 methodes valides, ou 1 seule et 0 disponibles
//   if(methodesValides.length >= 2) {
//     debug(`Authentification ok, ${methodesValides.length} methodes valides`)
//     authentificationValide = true
//   } else if(methodesValides.length === 1 && Object.keys(methodesDisponibles).length === 0) {
//     debug(`Authentification ok, 1 seule methode valide mais 0 disponibles`)
//     authentificationValide = true
//   }
//
//   debug("Authentification valide : %s", authentificationValide)
//
//   if(authentificationValide === true) {
//     socket.upgradeProtege(ok=>{
//       socket.emit('modeProtege', {'etat': ok})
//
//       // Conserver dans la session qu'on est alle en mode protege
//       // Permet de revalider le mode protege avec le certificat de navigateur
//       session.sessionValidee2Facteurs = true
//       session.authentificationSecondaire = deuxiemeFacteur
//       session.save()
//
//       return ok
//     })
//
//     // Emettre le certificat de navigateur pour s'assurer qu'il existe sur le noeud
//     var fullchain = null
//     if(params.certificatNavigateur) {
//       fullchain = splitPEMCerts(params.certificatNavigateur.fullchain)
//     }
//     if(fullchain) {
//       debug("Authentification valide, info certificat : %O", fullchain)
//       await comptesUsagers.emettreCertificatNavigateur(fullchain)
//     }
//
//   } else {
//     return false
//   }
//
//   // var sessionActive = false
//   // if(session.sessionValidee2Facteurs || session[CONST_AUTH_PRIMAIRE] !== 'certificat') {
//   //    sessionActive = await demandeChallengeCertificat(socket)
//   // }
//   //
//   // if(sessionActive) {
//   //   // Termine
//   //   return sessionActive
//   // }
//   //
//   // if(compteUsager.u2f) {
//   //   const challengeAuthU2f = generateLoginChallenge(compteUsager.u2f)
//   //
//   //   // TODO - Verifier challenge
//   //   socket.emit('challengeAuthU2F', challengeAuthU2f, (reponse) => {
//   //     debug("Reponse challenge : %s", reponse)
//   //     socket.upgradeProtege(ok=>{
//   //       console.debug("Upgrade protege ok : %s", ok)
//   //       socket.emit('modeProtege', {'etat': true})
//   //
//   //       // Conserver dans la session qu'on est alle en mode protege
//   //       // Permet de revalider le mode protege avec le certificat de navigateur
//   //       session.sessionValidee2Facteurs = true
//   //       session.save()
//   //     })
//   //   })
//   // } else {
//   //   // Aucun 2FA, on fait juste upgrader a protege
//   //   socket.upgradeProtege(ok=>{
//   //     console.debug("Upgrade protege ok : %s", ok)
//   //     socket.emit('modeProtege', {'etat': true})
//   //
//   //     // Conserver dans la session qu'on est alle en mode protege
//   //     // Permet de revalider le mode protege avec le certificat de navigateur
//   //     session.sessionValidee2Facteurs = true
//   //     session.save()
//   //   })
//   // }
//
// }

// async function auditMethodes(socket, params) {
//   // debug("upgradeProteger, params : %O", params)
//   const session = socket.handshake.session,
//         comptesUsagers = socket.comptesUsagers
//   const idmgCompte = session.idmgCompte
//
//   const infoCompte = await comptesUsagers.chargerCompte(session.nomUsager)
//   const compteUsager = infoCompte.compteUsager
//
//   debug("Info compte : %O\ncompteUsager : %O", infoCompte, compteUsager)
//   debug("Audit methodes validation, params : %O", params)
//
//   // Verifier methode d'authentification - refuser si meme que la methode primaire
//   const methodePrimaire = session[CONST_AUTH_PRIMAIRE],
//         webauthnCredId = session.webauthnCredId
//   const challengeSession = socket[CONST_CERTIFICAT_AUTH_CHALLENGE]
//
//   // Creer une liste de methodes disponibles et utilisees
//   // Comparer pour savoir si on a une combinaison valide
//   const methodesDisponibles = {}, methodesUtilisees = {}
//
//   // Methodes disponibles
//   if(compteUsager.tokenTotp) methodesDisponibles.tokenTotp = true
//   if(compteUsager.motdepasse) methodesDisponibles.motdepasse = true
//   if(compteUsager.webauthn) {
//     const credIds = compteUsager.webauthn.map(item=>item.credId).filter(item=>item!==webauthnCredId)
//     if(credIds.length > 0) {
//       credIds.forEach(credId=>{
//         methodesDisponibles['webauthn.' + credId] = true
//       })
//     }
//   }
//
//   if(webauthnCredId && methodePrimaire === 'webauthn') {
//     methodesUtilisees['webauthn.' + webauthnCredId] = {verifie: true}
//   } else {
//     methodesUtilisees[methodePrimaire] = {verifie: true}
//   }
//   if(params.challengeCleMillegrille) {
//     methodesUtilisees.cleMillegrille = {valeur: params.challengeCleMillegrille, verifie: false}
//   }
//   if(params.motdepasse) {
//     methodesUtilisees.motdepasse = {valeur: params.motdepasse, verifie: false}
//   }
//   if(params.tokenTotp) {
//     methodesUtilisees.tokenTotp = {valeur: params.tokenTotp, verifie: false}
//   }
//   if(params.date && params.data && params._certificat && params._signature) {
//     methodesUtilisees.certificat = {
//       valeur: params, challengeSession, certificat: params._certificat,
//       verifie: false,
//     }
//   }
//
//   debug("Methode d'authentification disponibles : %O\nMethodes utilisees: %O", methodesDisponibles, methodesUtilisees)
//
//   return {methodesDisponibles, methodesUtilisees}
// }

// async function genererChallenge2FA(socket, params, cb) {
//   const nomUsager = socket.nomUsager,
//         session = socket.handshake.session
//   debug("genererChallenge2FA: Preparation challenge usager : %s, params: %O", nomUsager, params)
//
//   if( ! nomUsager ) {
//     console.error("verifierUsager: Requete sans nom d'usager")
//     return cb({err: "Usager inconnu"})
//   }
//
//   // const nomUsager = req.nomUsager
//   const comptesUsagers = socket.comptesUsagers
//   const compteUsager = await comptesUsagers.chargerCompte(nomUsager)
//
//   debug("Compte usager recu")
//   debug(compteUsager)
//
//   if(compteUsager) {
//     // Usager connu, session ouverte
//     debug("Usager %s connu, transmission challenge login", nomUsager)
//
//     const reponse = {}
//
//     // Generer challenge pour le certificat de navigateur ou cle de millegrille
//     //if(params.certificatNavigateur) {
//       reponse.challengeCertificat = {
//         date: new Date().getTime(),
//         data: Buffer.from(randomBytes(32)).toString('base64'),
//       }
//       socket[CONST_CERTIFICAT_AUTH_CHALLENGE] = reponse.challengeCertificat
//     //}
//
//     if(compteUsager.webauthn) {
//       // Generer un challenge U2F
//       debug("Information cle usager")
//       debug(compteUsager.webauthn)
//       const challengeWebauthn = generateLoginChallenge(compteUsager.webauthn)
//
//       // Conserver challenge pour verif
//       socket[CONST_WEBAUTHN_CHALLENGE] = challengeWebauthn
//
//       reponse.challengeWebauthn = challengeWebauthn
//     }
//
//     if(compteUsager.motdepasse) {
//       reponse.motdepasseDisponible = true
//     }
//
//     if(compteUsager.totp) {
//       reponse.totpDisponible = true
//     }
//
//     if(session[CONST_AUTH_PRIMAIRE]) {
//       reponse[CONST_AUTH_PRIMAIRE] = session[CONST_AUTH_PRIMAIRE]
//     }
//
//     return cb(reponse)
//   } else {
//     return cb({err: "Erreur - compte usager n'est pas disponible"})
//   }
// }

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

function downgradePrive(socket, params) {

  // const listenersProteges = socket.listenersProteges
  //
  // listenersProteges.forEach(listenerName => {
  //   debug("Retrait listener %s", listenerName)
  //   socket.removeAllListeners(listenerName)
  // })
  //
  // // Cleanup socket
  // delete socket.listenersProteges

  socket.downgradePrive(_=>{
    socket.modeProtege = false
    socket.emit('modeProtege', {'etat': false})
  })

}

function getInfoIdmg(socket, params, cb) {
  const session = socket.handshake.session
  const comptesUsagers = socket.comptesUsagers

  // TODO - Verifier challenge
  cb({idmgCompte: session.idmgCompte, idmgsActifs: session.idmgsActifs})
}

async function genererCertificatNavigateurWS(socket, params) {
  debug("Generer certificat navigateur, params: %O", params)
  const session = socket.handshake.session

  const nomUsager = session.nomUsager,
        userId = session.userId
  const modeProtege = socket.modeProtege

  const csr = params.csr

  const opts = {}
  if(params.activationTierce) {
    opts.activationTierce = true
  }

  // const paramsCreationCertificat = {estProprietaire, modeProtege, nomUsager, csr}
  // debug("Parametres creation certificat navigateur\n%O", paramsCreationCertificat)

  if(modeProtege) {
    debug("Handshake du socket sous genererCertificatNavigateurWS : %O", socket.handshake)
    const session = socket.handshake.session
    const comptesUsagers = socket.comptesUsagers

    // Valider l'existence du compte et verifier si on a un compte special (e.g. proprietaire)
    const compteUsager = await comptesUsagers.chargerCompte(nomUsager)
    if(!compteUsager) {
      throw new Error("Compte usager inconnu : " + nomUsager)
    }

    debug("Information compte usager pour signature certificat : %O", compteUsager)
    debug("Usager : nomUsager=%s, userId=%s", nomUsager, userId)
    opts.estProprietaire = compteUsager.est_proprietaire?true:false

    const reponse = await comptesUsagers.signerCertificatNavigateur(csr, nomUsager, userId, opts)
    debug("Reponse signature certificat:\n%O", reponse)

    // const maitreClesDao = socket.handshake.maitreClesDao
    // const reponse = await maitreClesDao.signerCertificatNavigateur(csr, nomUsager, estProprietaire)
    // debug("Reponse signature certificat:\n%O", reponse)

    return reponse
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

async function demandeChallengeCertificat(socket) {

  const session = socket.handshake.session

  // La session a deja ete verifiee via 2FA, on tente une verification par
  // certificat de navigateur (aucune interaction avec l'usager requise)
  const demandeChallenge = {
    challengeCertificat: {
      date: new Date().getTime(),
      data: Buffer.from(randomBytes(32)).toString('base64'),
    },
    nomUsager: socket.nomUsager
  }

  debug("Emission challenge certificat avec socket.io : %O", demandeChallenge)

  sessionActive = await new Promise((resolve, reject)=>{
    socket.emit('challengeAuthCertificatNavigateur', demandeChallenge, reponse => {
      debug("Recu reponse challenge cert : %O", reponse)
      if(reponse.etat) {
        // Verifier la chaine de certificats
        const {fullchain} = reponse.reponse.certificats
        const reponseSignatureCert = reponse.reponse.reponseChallenge

        const chainePem = splitPEMCerts(fullchain)

        // Verifier les certificats et la signature du message
        // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
        const { cert: certNavigateur, idmg } = validerChaineCertificats(chainePem)

        const commonName = certNavigateur.subject.getField('CN').value
        if(socket.nomUsager !== commonName) {
          debug("Le certificat ne correspond pas a l'usager : CN=" + commonName)
          return resolve(false)
        }

        // S'assurer que le certificat client correspond au IDMG (O=IDMG)
        const organizationalUnit = certNavigateur.subject.getField('OU').value

        if(organizationalUnit !== 'Navigateur') {
          debug("Certificat fin n'est pas un certificat de Navigateur. OU=" + organizationalUnit)
          return resolve(false)
        } else {
          debug("Certificat fin est de type " + organizationalUnit)
        }

        debug("Reponse signature cert : %O", reponseSignatureCert)

        if(demandeChallenge.challengeCertificat.data !== reponseSignatureCert.data) {
          debug("Data challenge mismatch avec ce qu'on a envoye")
          return resolve(false)  // On n'a pas recue le bon data
        }

        // Verifier la signature
        const challengeVerifieOk = verifierChallengeCertificat(certNavigateur, reponseSignatureCert)
        if( challengeVerifieOk ) {
          debug("Upgrade protege via certificat de navigateur est valide")

          socket.upgradeProtege(ok=>{
            console.debug("Upgrade protege ok : %s", ok)
            socket.emit('modeProtege', {'etat': true})

            // Conserver dans la session qu'on est alle en mode protege
            // Permet de revalider le mode protege avec le certificat de navigateur
            session.sessionValidee2Facteurs = true
            session.save()
          })

          return resolve(true)  // Termine
        } else {
          console.error("Signature certificat invalide")
          return resolve(false)
        }
      }
      resolve(false)
    })
  })

  return sessionActive
}

async function sauvegarderCleDocument(socket, transaction, cb) {
  const comptesUsagers = socket.handshake.comptesUsagers
  const reponse = await comptesUsagers.relayerTransaction(transaction)
  cb(reponse)
}

async function sauvegarderSecretTotp(socket, transactions, cb) {

  try {
    const comptesUsagers = socket.handshake.comptesUsagers
    const session = socket.handshake.session
    const estProprietaire = session.estProprietaire,
          nomUsager = session.nomUsager

    const {transactionMaitredescles, transactionDocument} = transactions

    // S'assurer qu'on a des transactions des bons types, pour le bon usager
    if( transactionMaitredescles['en-tete'].domaine !== 'MaitreDesCles.sauvegarderCle' ) {
      cb({err: "Transaction maitre des cles de mauvais type"})
    } else if( transactionMaitredescles.identificateurs_document.libelle === 'proprietaire' && !estProprietaire ) {
      cb({err: "Transaction maitre des cles sur proprietaire n'est pas autorisee"})
    } else if( transactionMaitredescles.identificateurs_document.champ !== 'totp' ) {
      cb({err: "Transaction maitre des cles sur mauvais champ (doit etre totp)"})
    } else if( transactionDocument.nomUsager !== nomUsager ) {
      cb({err: "Transaction totp sur mauvais usager : " + transactionDocument.nomUsager, nomUsager})
    }

    // Transaction maitre des cles
    const amqpdao = socket.amqpdao  // comptesUsagers.amqDao
    const reponseMaitredescles = await amqpdao.transmettreCommande(
      transactionMaitredescles['en-tete'].domaine, transactionMaitredescles, {noformat: true})
    const reponseTotp = await comptesUsagers.relayerTransaction(transactionDocument)

    cb({reponseMaitredescles, reponseTotp})

    // Transaction
  } catch (err) {
    console.error("sauvegarderSecretTotp: Erreur generique : %O", err)
    cb({err})
  }

}

async function genererKeyTotp(socket, param, cb) {
  try {
    debug("Generer TOTP key...")
    const reponse = await validateurAuthentification.genererKeyTotp()
    debug("Reponse genererKeyTOTP: %O", reponse)
    cb(reponse)
  } catch(err) {
    debug("Erreur genererKeyTotp : %O", err)
    cb({err})
  }
}


module.exports = {
  init, configurerEvenements,
}
