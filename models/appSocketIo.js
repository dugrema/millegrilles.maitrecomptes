// Gestion evenements socket.io pour /millegrilles
const debug = require('debug')('millegrilles:maitrecomptes:appSocketIo');
const randomBytes = require('randombytes')
const multibase = require('multibase')
const {pki: forgePki} = require('node-forge')

const {
    splitPEMCerts, chargerClePrivee, chiffrerPrivateKey,
    verifierChallengeCertificat, validerChaineCertificats,
    hacherPem,
  } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { genererCSRIntermediaire, genererCertificatNavigateur, genererKeyPair
  } = require('@dugrema/millegrilles.common/lib/cryptoForge')
const { hacherPasswordCrypto } = require('@dugrema/millegrilles.common/lib/hachage')
const {
  genererChallengeWebAuthn, auditMethodes, upgradeProteger
} = require('@dugrema/millegrilles.common/lib/authentification')
const {
  init: initWebauthn,
  genererChallengeRegistration,
  verifierChallengeRegistration,
  genererRegistrationOptions,
  validerRegistration,
  verifierChallenge,
  webauthnResponseBytesToMultibase,
} = require('@dugrema/millegrilles.common/lib/webauthn')

const {
  verifierUsager,
  verifierSignatureCertificat,
  verifierSignatureMillegrille,
  CONST_CHALLENGE_CERTIFICAT,
  CONST_WEBAUTHN_CHALLENGE,
} = require('@dugrema/millegrilles.common/lib/authentification')

// const validateurAuthentification = require('../models/validerAuthentification')
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
      // {eventName: 'genererChallengeWebAuthn', callback: async (params, cb) => {cb(await genererChallengeWebAuthn(socket, params))}},
      {eventName: 'authentifierCertificat', callback: async (params, cb) => {wrapCb(authentifierCertificat(socket, params), cb)}},
      {eventName: 'authentifierWebauthn', callback: async (params, cb) => {wrapCb(authentifierWebauthn(socket, params), cb)}},
      {eventName: 'authentifierCleMillegrille', callback: async (params, cb) => {wrapCb(authentifierCleMillegrille(socket, params), cb)}},
    ],
    listenersPrives: [
      // {eventName: 'downgradePrive', callback: params => {downgradePrive(socket, params)}},
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
      // {eventName: 'maitredescomptes/genererKeyTotp', callback: (params, cb) => {genererKeyTotp(socket, params, cb)}},
      // {eventName: 'maitredescomptes/sauvegarderSecretTotp', callback: (params, cb) => {sauvegarderSecretTotp(socket, params, cb)}},
      // {eventName: 'associerIdmg', callback: params => {
      //   debug("Associer idmg")
      // }},
      // {eventName: 'maitredescomptes/changerMotDePasse', callback: async (params, cb) => {
      //   const timeout = setTimeout(() => {cb({'err': 'Timeout changerMotDePasse'})}, 7500)
      //   const resultat = await changerMotDePasse(socket, params)
      //   clearTimeout(timeout)
      //   cb({resultat})
      // }},
      {eventName: 'desactiverWebauthn', callback: params => {
        debug("Desactiver webauthn")
        throw new Error("Not implemented")
      }},
      // {eventName: 'desactiverMotdepasse', callback: params => {
      //   debug("Desactiver mot de passe")
      //   throw new Error("Not implemented")
      // }},
      {eventName: 'genererCertificatNavigateur', callback: async (params, cb) => {
        wrapCb(genererCertificatNavigateurWS(socket, params), cb)
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

// async function _verifierUsager(socket, params, cb) {
//   try {
//     cb(await verifierUsager(socket, params))
//   } catch(err) {
//     cb({err: ''+err, stack: err.stack})
//   }
// }

function wrapCb(promise, cb) {
  promise.then(reponse=>cb(reponse))
    .catch(err=>{
      debug("Erreur commande socket.io: %O", err)
      cb({err: ''+err, stack: err.stack})
    })
}

// function ajouterMotdepasse(req, res, next) {
//   var infoCompteUsager = req.compteUsager
//
//   // Verifier si un mot de passe existe deja
//   if(infoCompteUsager.motdepasse) {
//     debug("Mot de passe existe deja, il faut utiliser le formulaire de changement")
//     return res.sendStatus(403);
//   } else {
//     const {motdepasseNouveau} = req.body
//     var nomUsager = req.nomUsager
//
//     const estProprietaire = req.sessionUsager.estProprietaire
//     if(estProprietaire && req.body['nom-usager']) {
//       nomUsager = req.body['nom-usager']
//     }
//
//     genererMotdepasse(motdepasseNouveau)
//     .then(infoMotdepasse => {
//       req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse, estProprietaire)
//       if(estProprietaire) {
//         // On modifie le nomUsager du proprietaire
//         req.sessionUsager.nomUsager = nomUsager
//       }
//       return res.sendStatus(200)  // OK
//     })
//     .catch(err=>{
//       console.error("Erreur hachage mot de passe")
//       console.error(err)
//       return res.sendStatus(500)
//     })
//   }
//
// }

// async function changerMotDePasse(socket, params) {
//   const req = socket.handshake,
//         session = req.session,
//         comptesUsagers = socket.handshake.comptesUsagers
//
//   // if( session.estProprietaire ) {
//   if( ! socket.modeProtege ) {
//     throw new Error("Le mot de passe ne peut etre change qu'en mode protege")
//   }
//
//   const nomUsager = socket.nomUsager
//
//   // Note : le mot de passe est chiffre
//   debug("Changer mot de passe %s : %O", nomUsager, params)
//
//   const {commandeMaitredescles, transactionCompteUsager} = params
//
//   // S'assurer qu'on a des transactions des bons types, pour le bon usager
//   if( commandeMaitredescles['en-tete'].domaine !== 'MaitreDesCles.sauvegarderCle' ) {
//     throw new Error("Transaction maitre des cles de mauvais type")
//   } else if( commandeMaitredescles.identificateurs_document.champ !== 'motdepasse' ) {
//     throw new Error("Transaction maitre des cles sur mauvais champ (doit etre motdepasse)")
//   } else if( transactionCompteUsager['en-tete'].domaine !== 'MaitreDesComptes.majMotdepasse' ) {
//     throw new Error("Transaction changement mot de passe est de mauvais type : " + transactionDocument['en-tete'].domaine)
//   } else if( transactionCompteUsager.nomUsager !== nomUsager ) {
//     throw new Error("Transaction changement mot de passe sur mauvais usager : " + nomUsager)
//   }
//
//   // Soumettre les transactions
//   const amqpdao = socket.amqpdao
//   const reponseMaitredescles = await amqpdao.transmettreCommande(
//     commandeMaitredescles['en-tete'].domaine, commandeMaitredescles, {noformat: true})
//   const reponseMotdepasse = await comptesUsagers.relayerTransaction(transactionCompteUsager)
//
//   return {reponseMaitredescles, reponseMotdepasse}
// }

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

  // const registrationRequest = u2f.request(MG_IDMG);
  debug("Registration request, userId %s, usager %s, hostname %s", userId, nomUsager, hostname)
  // var userIdArray = new Uint8Array(String.fromCharCode.apply(null, multibase.decode(userId)))

  // const challengeInfo = {
  //     relyingParty: { name: hostname },
  //     user: { id: nomUsager, name: nomUsager }
  // }

  const registrationChallenge = await genererRegistrationOptions(userId, nomUsager, {hostname})
  debug("Registration challenge : %O", registrationChallenge)
  debug("Attestation challenge : %O", registrationChallenge.attestation)

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
  socket.attestationExpectations = registrationChallenge.attestationExpectations

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

  socket.downgradePrive(_=>{
    socket.modeProtege = false
    socket.emit('modeProtege', {'etat': false})
  })

}

async function getInfoIdmg(socket, params) {
  const session = socket.handshake.session
  debug("appSocketIo.getInfoIdmg session %O", session)
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

  // const demandeCertificat = params.demandeCertificat

  // const opts = {}
  // if(params.activationTierce) {
  //   opts.activationTierce = true
  // }

  // const paramsCreationCertificat = {estProprietaire, modeProtege, nomUsager, csr}
  // debug("Parametres creation certificat navigateur\n%O", paramsCreationCertificat)

  if(modeProtege) {
    debug("Handshake du socket sous genererCertificatNavigateurWS : %O", socket.handshake)
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

    // const reponse = await comptesUsagers.signerCertificatNavigateur(commandeSignature)
    // debug("Reponse signature certificat:\n%O", reponse)

    // const maitreClesDao = socket.handshake.maitreClesDao
    // const reponse = await maitreClesDao.signerCertificatNavigateur(csr, nomUsager, estProprietaire)
    // debug("Reponse signature certificat:\n%O", reponse)

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

// async function genererKeyTotp(socket, param, cb) {
//   try {
//     debug("Generer TOTP key...")
//     const reponse = await validateurAuthentification.genererKeyTotp()
//     debug("Reponse genererKeyTOTP: %O", reponse)
//     cb(reponse)
//   } catch(err) {
//     debug("Erreur genererKeyTotp : %O", err)
//     cb({err})
//   }
// }

async function ecouterFingerprintPk(socket, params) {
  const fingerprintPk = params.fingerprintPk
  // Associer socket au fingerprint
  const roomName = `fingerprintPk/${fingerprintPk}`
  debug("Socket %s join room %s", socket.id, roomName)
  socket.join(roomName)
  return
}

async function authentifierCertificat(socket, params) {
  const idmg = socket.amqpdao.pki.idmg

  var challengeServeur = socket[CONST_CHALLENGE_CERTIFICAT]
  const chainePem = params['_certificat']

  debug("Information authentifierCertificat :\nchallengeSession: %O\nparams: %O",
    challengeServeur, params)

  const reponse = await verifierSignatureCertificat(idmg, chainePem, challengeServeur, params)
  if(reponse.valide !== true) {return {err: 'Signature invalide'}}

  // Verifier si c'est une reconnexion - la session existe et est valide (auth multiples)
  const session = socket.handshake.session
  const auth = session.auth
  let userId = session.userId

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
  if(!userId){
    // On n'a pas de session existante. Verifier si le compte a au moins une
    // methode de verification forte.
    const infoUsager = await socket.comptesUsagersDao.chargerCompte(reponse.nomUsager)
    userId = infoUsager.userId

    // Verifier si le certificat est nouvellement active - peut donner un facteur
    // de verification additionnel (e.g. pour activer une premiere cle)
    const fingerprintPk = await calculerFingerprintPkCert(chainePem[0])
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

    debug("Session: %O", socket, session)

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
  const chainePem = params['_certificat']

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

function calculerScoreVerification(auth) {
  return Object.values(auth).reduce((compteur, item)=>{
    return compteur + item
  }, 0)
}

async function calculerFingerprintPkCert(certPem) {
  const certForge = forgePki.certificateFromPem(certPem)
  const publicKeyPem = forgePki.publicKeyToPem(certForge.publicKey)
  const fingerprintPk = await hacherPem(publicKeyPem)
  return fingerprintPk
}

module.exports = {
  init, configurerEvenements,
}
