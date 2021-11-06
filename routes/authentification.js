// Route pour authentifier les usagers
// Toutes les fonctions de cette route sont ouvertes (aucune authentification requise)

const debug = require('debug')('millegrilles:maitrecomptes:authentification')
const debugVerif = require('debug')('millegrilles:maitrecomptes:verification')
const express = require('express')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid')
const {randomBytes /*, pbkdf2 */} = require('crypto')
const { pki: forgePki } = require('node-forge')
const stringify = require('json-stable-stringify')
const cors = require('cors')
const https = require('https')

const {
    splitPEMCerts, verifierChallengeCertificat,
    chargerClePrivee, chiffrerPrivateKey,
    matchCertificatKey, calculerHachageCertificatPEM,
    validerChaineCertificats,
  } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { getIdmg } = require('@dugrema/millegrilles.common/lib/idmg')
const { genererCSRIntermediaire, genererCertificatNavigateur, genererKeyPair } = require('@dugrema/millegrilles.common/lib/cryptoForge')

const { inscrire, reponseInscription } = require('../models/inscrire')

const {
  init: initWebauthn,
  genererChallengeRegistration,
  verifierChallengeRegistration,
  authentifier: authentifierWebauthn
} = require('@dugrema/millegrilles.common/lib/webauthn')
const {
  verifierUsager, verifierSignatureCertificat, verifierSignatureMillegrille,
  auditMethodes,
  // verifierMethode,
} = require('@dugrema/millegrilles.common/lib/authentification')

const CONST_CHALLENGE_WEBAUTHN = 'challengeWebauthn',
      CONST_CHALLENGE_CERTIFICAT = 'challengeCertificat',
      CONST_AUTH_PRIMAIRE = 'authentificationPrimaire',
      CONST_URL_ERREUR_MOTDEPASSE = '/millegrilles?erreurMotdepasse=true'

function initialiser(middleware, hostname, idmg, opts) {
  opts = opts || {}

  debug("Initialiser authentification hostname %s, idmg %s, opts : %O", hostname, idmg, opts)

  // Initialiser verification webauthn
  initWebauthn(hostname, idmg)

  const route = express.Router()

  // const corsFedere = configurerCorsFedere()
  const bodyParserJson = bodyParser.json()
  const bodyParserUrlEncoded = bodyParser.urlencoded({extended: true})

  // Routes sans body
  route.get('/verifier', verifierAuthentification)
  route.get('/verifier_public', (req,res,next)=>{req.public_ok = true; next();}, verifierAuthentification)
  route.get('/fermer', fermer)

  route.use(bodyParserJson)  // Pour toutes les routes suivantes, on fait le parsing json

  // route.post('/prendrePossession', verifierChallengeRegistration, prendrePossession, creerSessionUsager, (req, res)=>{res.sendStatus(201)})

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

  debugVerif("verifierAuthentification : headers = %O\nsession = %O", req.headers, req.session)

  const sessionUsager = req.session

  if(sessionUsager) {
    const {userId, nomUsager, auth} = sessionUsager

    if(!auth || auth.length === 0) {
      debugVerif("Usager n'est pas authentifie")
      return res.sendStatus(401)
    }

    debugVerif("OK - usager authentifie : %s", nomUsager)

    // L'usager est authentifie, verifier IP client
    if(sessionUsager.ipClient !== req.headers['x-forwarded-for']) {
      debugVerif("Usager authentifie mais mauvais IP : %s !== %s", sessionUsager.ipClient, req.headers['x-forwarded-for'])
      return res.sendStatus(401)
    }

    res.set('X-User-Id', userId)
    res.set('X-User-Name', nomUsager)
    res.set('X-User-AuthScore', calculerAuthScore(auth))

    verificationOk = true
  }

  if(verificationOk) {
    return res.sendStatus(201)
  } else {
    if(req.public_ok) {
      debugVerif("Usager non authentifie mais public OK, url : %s", req.url)
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

async function ouvrir(req, res, next) {
  debug("ouvrir: Authentifier, body : %O", req.body)

  const nomUsager = req.body.nomUsager
  const ipClient = req.headers['x-forwarded-for']
  const fullchainPem = req.body['certificat-fullchain-pem']

  if( ! nomUsager ) return res.sendStatus(400)

  // Valider la chaine de certificat fournie par le client
  let infoCompteUsager = await req.comptesUsagersDao.chargerCompte(nomUsager)

  req.nomUsager = nomUsager
  req.ipClient = ipClient

  debug("Usager : %s", nomUsager)

  // Verifier autorisation d'access
  var autorise = false
  req.compteUsager = infoCompteUsager
  req.userId = infoCompteUsager.userId
  debug("Info compte usager : %O", infoCompteUsager)

  if( ! infoCompteUsager ) {
    debug("Compte usager inconnu pour %s", nomUsager)
  } else if(req.session[CONST_AUTH_PRIMAIRE]) {
    debug("Authentification acceptee par defaut avec methode %s", req.session[CONST_AUTH_PRIMAIRE])
    return next()
  } else {
    const {methodesDisponibles, methodesUtilisees} = await auditMethodes(req, req.body)
    debug("Authentification etat avec %d methodes : %O", nombreVerifiees, methodesUtilisees)

    for(let methode in methodesUtilisees) {
      const params = methodesUtilisees[methode]
      // Modifie les flags dans params
      await verifierMethode(req, methode, infoCompteUsager, params)
    }

    var nombreVerifiees = 0
    Object.keys(methodesUtilisees).forEach(item=>{
      if(methodesDisponibles[item] && methodesUtilisees[item].verifie) {
        nombreVerifiees++
      }
    })

    if(nombreVerifiees > 0) {
      // Ok
      const methodeUtilisee = Object.keys(methodesUtilisees)[0]
      req.session[CONST_AUTH_PRIMAIRE] = methodeUtilisee
      return next()
    }
  }

  // Par defaut refuser l'acces
  return refuserAcces(req, res, next)

}

function refuserAcces(req, res, next) {
  return res.sendStatus(401)
}

function fermer(req, res, next) {
  invaliderCookieAuth(req)
  res.redirect('/millegrilles');
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
        compteUsager = req.compteUsager,
        userId = req.userId

  debug("Creer session usager pour %s\n%O", nomUsager, compteUsager)

  const idmg = req.amqpdao.pki.idmg  // Mode sans hebergemenet
  const estProprietaire = compteUsager.est_proprietaire

  let userInfo = {
    ipClient,
    idmgCompte: idmg,
    nomUsager,
    userId,
  }

  // Copier userInfo dans session
  Object.assign(req.session, userInfo)
  debug("Contenu session : %O", req.session)

  next()
}

function calculerAuthScore(auth) {
  if(!auth) return 0
  const score = Object.values(auth)
    .reduce((score, item)=>{return score + item}, 0)
  return score
}

module.exports = {
  initialiser,
}
