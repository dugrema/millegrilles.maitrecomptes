// Route pour authentifier les usagers
// Toutes les fonctions de cette route sont ouvertes (aucune authentification requise)

const debug = require('debug')('millegrilles:maitrecomptes:authentification')
const debugVerif = require('debug')('millegrilles:maitrecomptes:verification')
const express = require('express')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid')
const {randomBytes /*, pbkdf2 */} = require('crypto')
const { pki: forgePki } = require('node-forge')
// const {
//     parseRegisterRequest,
//     generateRegistrationChallenge,
//     parseLoginRequest,
//     generateLoginChallenge,
//     verifyAuthenticatorAssertion,
// } = require('@webauthn/server');
const stringify = require('json-stable-stringify')
const cors = require('cors')
const https = require('https')
// const authenticator = require('authenticator')

const {
    splitPEMCerts, verifierChallengeCertificat,
    chargerClePrivee, chiffrerPrivateKey,
    matchCertificatKey, calculerHachageCertificatPEM,
    validerChaineCertificats,
  } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { getIdmg } = require('@dugrema/millegrilles.common/lib/idmg')
const { genererCSRIntermediaire, genererCertificatNavigateur, genererKeyPair } = require('@dugrema/millegrilles.common/lib/cryptoForge')

const { inscrire } = require('../models/inscrire')

const validateurAuthentification = require('../models/validerAuthentification')
const {
  init: initWebauthn,
  genererChallengeRegistration,
  verifierChallengeRegistration,
  // genererChallenge,
  authentifier: authentifierWebauthn
} = require('@dugrema/millegrilles.common/lib/webauthn')
const { verifierUsager, verifierSignatureCertificat, verifierMotdepasse, verifierTotp } = require('@dugrema/millegrilles.common/lib/authentification')

const CONST_CHALLENGE_WEBAUTHN = 'challengeWebauthn',
      CONST_CHALLENGE_CERTIFICAT = 'challengeCertificat',
      CONST_AUTH_PRIMAIRE = 'authentificationPrimaire',
      CONST_URL_ERREUR_MOTDEPASSE = '/millegrilles?erreurMotdepasse=true'

// // Parametres d'obfuscation / hachage pour les mots de passe
// const PBKDF2_KEYLEN = 64,
//       PBKDF2_HASHFUNCTION = 'sha512'

function initialiser(middleware, opts) {

  debug("Initialiser authentification (opts : %O)", opts)

  // Initialiser verification webauthn
  initWebauthn(opts.hostname, opts.idmg)

  const route = express.Router()

  // const corsFedere = configurerCorsFedere()
  const bodyParserJson = bodyParser.json()
  const bodyParserUrlEncoded = bodyParser.urlencoded({extended: true})

  // Routes sans body
  route.get('/verifier', verifierAuthentification)
  route.get('/verifier_public', (req,res,next)=>{req.public_ok = true; next();}, verifierAuthentification)
  route.get('/fermer', fermer)

  route.use(bodyParserJson)  // Pour toutes les routes suivantes, on fait le parsing json

  route.post('/challengeRegistration', genererChallengeRegistration)
  route.post('/inscrire', inscrire, creerSessionUsager)
  route.post('/prendrePossession', verifierChallengeRegistration, prendrePossession)
  route.post('/verifierUsager', verifierUsager)

  route.post('/ouvrir',
    identifierUsager,                   // req.nomUsager
    middleware.extraireUsager,          // req.compteUsager
    verifierChaineCertificatNavigateur, // Verification fullchain, req.certificat, req.idmgCompte, req.idmgsActifs
    authentifierCertificat,             // Authentification via signature challenge certificat
    // verifierIdmgs,
    ouvrir,                             // Decide si auth est valide
    creerSessionUsager,                 // Auth est valide, ajout params dans req.session
    rediriger                           // Page accueil ou page demandee
  )

  // Toutes les routes suivantes assument que l'usager est deja identifie
  route.use(middleware.extraireUsager)

  // Acces refuse
  route.get('/refuser.html', (req, res) => {
    res.redirect(CONST_URL_ERREUR_MOTDEPASSE);
  })

  return route
}

function identifierUsager(req, res, next) {
  const nomUsager = req.body.nomUsager
  if(nomUsager) {
    req.nomUsager = nomUsager
  }
  next()
}

function verifierAuthentification(req, res, next) {
  let verificationOk = false

  const sessionUsager = req.session
  if(sessionUsager) {

    // Verifier IP
    if(sessionUsager.authentificationPrimaire && sessionUsager.ipClient === req.headers['x-forwarded-for']) {
      const nomUsager = sessionUsager.nomUsager
      // const estProprietaire = sessionUsager.estProprietaire
      debugVerif("OK - deja authentifie : %s", nomUsager)

      // if(sessionUsager.idmgCompte) {
      //   res.set('Idmg-Compte', sessionUsager.idmgCompte)
      // }

      // if(sessionUsager.idmgsActifs) {
      //   res.set('Idmgs-Actifs', sessionUsager.idmgsActifs.join(','))
      // }

      // if(estProprietaire) {
      //   res.set('Est-Proprietaire', 'true')
      // }

      if(nomUsager) {
        res.set('User-Prive', nomUsager)
      }
      res.set('Auth-Primaire', sessionUsager.authentificationPrimaire)
      if(sessionUsager.authentificationSecondaire) {
        res.set('Auth-Secondaire', sessionUsager.authentificationSecondaire)
      }

      verificationOk = true;
    }

  }

  if(verificationOk) {
    return res.sendStatus(201)
  } else {
    if(req.public_ok) {
      debugVerif("Usager non authentifie masi public OK, url : %s", req.url)
      return res.sendStatus(202)
    } else {
      debugVerif("Usager non authentifie, url : %s", req.url)
      return res.sendStatus(401)
    }
  }
}

async function challengeChaineCertificats(req, res, next) {
  // debug("Req body")
  // debug(req.body)

  try {
    const challengeId = uuidv4()  // Generer challenge id aleatoire

    // Conserver challenge pour verif
    challengeU2fDict[challengeId] = {
      timestampCreation: new Date().getTime(),
    }

    const challengeRecu = req.body.challenge

    const pkiInstance = req.amqpdao.pki

    const reponse = {
      challengeId: challengeId,
      challengeRecu,
      chaineCertificats: splitPEMCerts(pkiInstance.chainePEM)
    }

    debug("Challenge recu pour certificats, challengId client : %s", challengeRecu)

    const signature = pkiInstance.signerContenuString(stringify(reponse))
    reponse['_signature'] = signature

    res.status(201).send(reponse)

  } catch(err) {
    console.error(err)
    debug(err)
    res.redirect(CONST_URL_ERREUR_MOTDEPASSE)
  }
}

// async function verifierUsager(req, res, next) {
//   const nomUsager = req.body.nomUsager,
//         fingerprintPk = req.body.fingerprintPk
//   debug("Verification d'existence d'un usager : %s\nBody: %O", nomUsager, req.body)
//
//   if( ! nomUsager ) {
//     console.error("verifierUsager: Requete sans nom d'usager")
//     return res.sendStatus(400)
//   }
//
//   const infoUsager = await req.comptesUsagers.chargerCompte(nomUsager, fingerprintPk)
//   const compteUsager = infoUsager
//
//   debug("Compte usager recu")
//   debug(infoUsager)
//
//   if(compteUsager) {
//     // Usager connu, session ouverte
//     debug("Usager %s connu, transmission challenge login", nomUsager)
//
//     const reponse = {}
//
//     if(compteUsager.certificat) {
//       reponse.certificat = compteUsager.certificat
//     }
//
//     // Generer challenge pour le certificat de navigateur ou de millegrille
//     //if(req.body.certificatNavigateur) {
//       reponse.challengeCertificat = {
//         date: new Date().getTime(),
//         data: Buffer.from(randomBytes(32)).toString('base64'),
//       }
//       req.session[CONST_CHALLENGE_CERTIFICAT] = reponse.challengeCertificat
//     //}
//
//     if(compteUsager.webauthn) {
//       // Generer un challenge U2F
//       debug("Information cle usager")
//       debug(compteUsager.webauthn)
//       const challengeWebauthn = await genererChallenge(compteUsager)
//
//       // Conserver challenge pour verif
//       req.session[CONST_CHALLENGE_WEBAUTHN] = challengeWebauthn.challenge
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
//     if(req.session[CONST_AUTH_PRIMAIRE]) {
//       reponse[CONST_AUTH_PRIMAIRE] = req.session[CONST_AUTH_PRIMAIRE]
//     }
//
//     res.send(reponse)
//   } else {
//     // Usager inconnu
//     debug("Usager inconnu")
//     res.sendStatus(401)
//   }
// }

// async function ouvrirProprietaire(req, res, next) {
//   debug("Authentifier proprietaire via U2F :\n%O", req.body)
//   debug("Session courante :\n%O", req.session)
//
//   const ipClient = req.headers['x-forwarded-for']
//   let infoCompteProprietaire = await req.comptesUsagers.infoCompteProprietaire()
//   req.compteUsager = infoCompteProprietaire
//
//   req.ipClient = ipClient
//
//   return authentifierWebauthn(req, res, next)
// }

async function ouvrir(req, res, next) {
  debug("ouvrir: Authentifier, body : %O", req.body)

  const nomUsager = req.body.nomUsager
  const ipClient = req.headers['x-forwarded-for']
  const fullchainPem = req.body['certificat-fullchain-pem']

  if( ! nomUsager ) return res.sendStatus(400)

  // Valider la chaine de certificat fournie par le client
  let infoCompteUsager = await req.comptesUsagers.chargerCompte(nomUsager)

  req.nomUsager = nomUsager
  req.ipClient = ipClient

  debug("Usager : %s", nomUsager)

  // Verifier autorisation d'access
  var autorise = false
  req.compteUsager = infoCompteUsager
  debug("Info compte usager : %O", infoCompteUsager)

  // const modeFedere = req.body.federe

  if( ! infoCompteUsager ) {
    // if(modeFedere) {
    //   debug("Inscription d'un nouveau compte federe")
    //   return inscrireFedere(req, res, next)
    // } else {
      debug("Compte usager inconnu pour %s", nomUsager)
    // }
    // } else if(modeFedere) {
    //   return authentifierFedere(req, res, next)
  } else if(req.body.motdepasse) {
    return authentifierMotdepasse(req, res, next)
  } else if(req.body.webauthn) {
    return authentifierWebauthn(req, res, next)
  } else if(req.body.tokenTotp) {
    return authentifierTotp(req, res, next)
  } else if(req.body.challengeCleMillegrille) {
    return authentifierCleMillegrille(req, res, next)
  } else if(req.session[CONST_AUTH_PRIMAIRE]) {
    debug("Authentification acceptee par defaut avec methode %s", req.session[CONST_AUTH_PRIMAIRE])
    return next()
  }

  // Par defaut refuser l'acces
  return refuserAcces(req, res, next)

}

async function authentifierMotdepasse(req, res, next) {

  const comptesUsagers = req.comptesUsagers,
        infoCompteUsager = req.compteUsager

  try {
    // debug("Info compte usager")
    debug("authentifierMotdepasse: infoCompteUsager : %O", infoCompteUsager)

    const motdepasse = req.body.motdepasse
    const resultat = await verifierMotdepasse(
      comptesUsagers, infoCompteUsager, motdepasse)

      if(resultat.valide) {
        // Autorise OK
        req.session[CONST_AUTH_PRIMAIRE] = 'motdepasse'
        return next()
      } else {
        // Mauvais mot de passe
        debug("Mauvais mot de passe")
      }

  } catch(err) {
    console.error('Erreur authentifierMotdepasse: %O', err)
  }

  // Par defaut, echec d'authentification
  // return res.redirect(CONST_URL_ERREUR_MOTDEPASSE)
  res.sendStatus(401)
}

async function authentifierTotp(req, res, next) {
  // Recuperer cle dechiffrage du secret TOTP
  try {
    const comptesUsagersDao = req.comptesUsagers
    const compteUsager = req.compteUsager
    debug("authentifierTotp: infoCompteUsager : %O", compteUsager)

    if(compteUsager['_mg-libelle'] === 'proprietaire' || compteUsager.nomUsager === 'proprietaire') {
      // debug("Requete secret TOTP pour proprietaire")
      // const secretTotp = await comptesUsagerDao.requeteCleProprietaireTotp(infoUsagerTotp)
      // debug("Recu secret TOTP pour proprietaire : %O", secretTotp)
      // const cleTotp = secretTotp.totp
      //
      // const valide = authenticator.verifyToken(cleTotp, req.body.tokenTotp)

      const resultat = await verifierTotp(
        comptesUsagersDao, compteUsager, req.body.tokenTotp)

      if(resultat.valide) {
        req.session[CONST_AUTH_PRIMAIRE] = 'totp'
        return next()
      } else {
        debug("Token TOTP invalide")
      }
    }

  } catch(err) {
    console.error("Erreur demande code secret TOTP : %O", err)
  }

  // Par defaut, acces refuse
  return refuserAcces(req, res, next)
}

async function authentifierCleMillegrille(req, res, next) {
  // Authentification en utilisant la cle de millegrille
  const challengeBody = req.body.challengeCleMillegrille,
        challengeSession = req.session[CONST_CHALLENGE_CERTIFICAT],
        amqpdao = req.amqpdao

  debug("authentifierCleMillegrille :\nBody: %O\nSession: %O", challengeBody, challengeSession)

  const certMillegrille = amqpdao.pki.caForge

  if(challengeBody && challengeSession) {
    debug("authentifierCleMillegrille : verifier signature et comparer info avec session")
    const valide = await validateurAuthentification.verifierSignatureMillegrille(
      certMillegrille, challengeSession, challengeBody)
    debug("Information validite : %O", valide)

    if(valide) {
      req.session[CONST_AUTH_PRIMAIRE] = 'clemillegrille'  // Indique succes auth
      req.session.estProprietaire = true  // Forcer access proprietaire
      return next()
    } else {
      console.error("Signature certificat invalide")
    }
  }

  // Par defaut, acces refuse
  return refuserAcces(req, res, next)
}

async function verifierChaineCertificatNavigateur(req, res, next) {
  debug("verifierChaineCertificatNavigateur : %O", req.body)

  // Verifier que la chaine de certificat est valide
  const compteUsager = req.compteUsager

  if( req.body.certificatFullchainPem ) {
    const chainePem = splitPEMCerts(req.body.certificatFullchainPem)

    // Verifier les certificats et la signature du message
    // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
    const { cert: certNavigateur, idmg } = await validerChaineCertificats(chainePem)

    const commonName = certNavigateur.subject.getField('CN').value
    if(req.nomUsager !== commonName) {
      throw new Error("Le certificat ne correspond pas a l'usager : CN=" + commonName)
    }

    // S'assurer que le certificat client correspond au IDMG (O=IDMG)
    const organizationalUnit = certNavigateur.subject.getField('OU').value

    if(organizationalUnit !== 'Navigateur') {
      throw new Error("Certificat fin n'est pas un certificat de Navigateur. OU=" + organizationalUnit)
    } else {
      debug("Certificat fin est de type " + organizationalUnit)
    }

    debug("Cert navigateur, idmg %s :\n%O", idmg, certNavigateur)

    req.idmgActifs = [idmg]
    req.idmgCompte = idmg
    req.certificat = certNavigateur  // Conserver reference au certificat pour la session
  } else {
    debug("Certificat navigateur absent")
  }

  next()
}

async function authentifierCertificat(req, res, next) {
  debug("Info auth avec certificat")
  debug(req.body)

  const compteUsager = req.compteUsager
  debug("Compte usager")
  debug(compteUsager)

  try {
    if( req.body.data && req.body.date && req.body._certificat ) {
      const challengeBody = req.body,
            challengeSession = req.session[CONST_CHALLENGE_CERTIFICAT],
            idmgSysteme = req.amqpdao.pki.idmg,
            chainePem = req.body._certificat

      debug("Verification challenge certificat, session : %O", req.session)

      if(challengeBody && challengeSession) {
        const {valide} = await verifierSignatureCertificat(
          idmgSysteme, compteUsager, chainePem, challengeSession, challengeBody)

        if(valide) {
          debug("Verification certificat OK")
          req.session[CONST_AUTH_PRIMAIRE] = 'certificat'  // Indique succes auth
          return next()
        } else {
          console.error("Signature certificat invalide")
        }

      } else {
        // Aucun challenge signe pour le certificat, on n'ajoute pas de methode d'authentification
        // primaire sur req (une autre methode doit etre fournie comme mot de passe, U2F, etc.)
      }
    } else {
      debug("Skip authentification par navigateur")
    }
  } catch(err) {
    console.error(err)
    debug(err)
    return res.sendStatus(401)
  } finally {
    // Nettoyage session
    // delete req.session[CONST_CHALLENGE]
  }

  // Meme si le test echoue, on continue pour voir si une autre methode fonctionne
  next()
}

function verifierCerficatSignature(chaineCertificats, messageSigne) {
  // Verifier les certificats et la signature du message
  // Une erreur est lancee si la signature est invalide
  validerCertificatFin(chaineCertificats, {messageSigne})
}

function refuserAcces(req, res, next) {
  return res.sendStatus(401)
}

function fermer(req, res, next) {
  invaliderCookieAuth(req)
  res.redirect('/millegrilles#fermer');
}

async function prendrePossession(req, res, next) {
  const informationCle = req.informationCle
  debug("prendrePossession: Information enregistrement usager : %O", informationCle)

  // Transmettre l'information du proprietaire au maitre des comptes
  const comptesUsagers = req.comptesUsagers

  try {
    await comptesUsagers.prendrePossession(informationCle)
  } catch(err) {
    debug("prendrePossession: Erreur inscription proprietaire : %O", err)
    return res.sendStatus(403)
  }
}

function rediriger(req, res) {
  const url = req.body.url;
  debug("Page de redirection : %s", url)

  if(url) {
    res.redirect(url);
  } else {
    res.redirect('/millegrilles')
  }
}

function invaliderCookieAuth(req) {
  req.session.destroy()
}

function creerSessionUsager(req, res, next) {

  const nomUsager = req.nomUsager,
        ipClient = req.ipClient,
        compteUsager = req.compteUsager

  debug("Creer session usager pour %s\n%O", nomUsager, compteUsager)

  let userInfo = {
    ipClient,
  }

  if(compteUsager['nomUsager'] === 'proprietaire') {
    debug("Compte proprietaire : %O", compteUsager)
    debug("PKI login proprietaire : %O", req.amqpdao.pki)
    const idmg = req.amqpdao.pki.idmg  // Mode sans hebergemenet
    userInfo.idmgCompte = idmg
    userInfo.estProprietaire = true
    if(compteUsager.nomUsager) {
      userInfo.nomUsager = compteUsager.nomUsager
    } else {
      userInfo.nomUsager = 'proprietaire'
    }
  } else {
    debug("Injecter idmgCompte implicitement : %s", req.idmgCompte)
    userInfo.idmgCompte = req.idmgCompte
    userInfo.nomUsager = nomUsager
  }

  // Copier userInfo dans session
  Object.assign(req.session, userInfo)
  debug("Contenu session : %O", req.session)

  next()
}

module.exports = {
  initialiser,
}
