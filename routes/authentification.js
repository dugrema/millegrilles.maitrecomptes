// Route pour authentifier les usagers
// Toutes les fonctions de cette route sont ouvertes (aucune authentification requise)

const debug = require('debug')('millegrilles:maitrecomptes:authentification')
const debugVerif = require('debug')('millegrilles:maitrecomptes:verification')
const express = require('express')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid')
const stringify = require('json-stable-stringify')

const { pki } = require('@dugrema/node-forge')
const { splitPEMCerts, extraireExtensionsMillegrille } = require('@dugrema/millegrilles.utiljs/src/forgecommon')
const { init: initWebauthn } = require('@dugrema/millegrilles.nodejs/src/webauthn')
const { auditMethodes } = require('@dugrema/millegrilles.nodejs/src/authentification')

const CONST_AUTH_PRIMAIRE = 'authentificationPrimaire',
      CONST_URL_ERREUR_MOTDEPASSE = '/millegrilles?erreurMotdepasse=true'

function initialiser(middleware, hostname, idmg, opts) {
  opts = opts || {}

  debug("Initialiser authentification hostname %s, idmg %s, opts : %O", hostname, idmg, opts)

  // Initialiser verification webauthn
  initWebauthn(hostname, idmg)

  const route = express.Router()

  // const corsFedere = configurerCorsFedere()
  const bodyParserJson = bodyParser.json()

  // Routes sans body
  route.get('/verifier', verifierAuthentification)
  route.get('/verifier_public', (req,res,next)=>{req.public_ok = true; next();}, verifierAuthentification)
  route.get('/verifier_tlsclient', verifierTlsClient)
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

function verifierAuthentification(req, res) {
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

function verifierTlsClient(req, res) {
  debugVerif("verifierAuthentification : headers = %O", req.headers)

  const nginxVerified = req.headers['verified']

  if(nginxVerified !== 'SUCCESS') {
    // Nginx considere le certificat invalide
    return res.sendStatus(401)
  }

  const subject = req.headers.dn || ''

  // Autorisation : OU === nginx
  const subjectDns = subject.split(',').reduce((acc, item)=>{
    const val = item.split('=')
    acc[val[0]] = val[1]
    return acc
  }, {})
  debugVerif("Autorisation subject DNs : %O", subjectDns)
  const ou = subjectDns['OU']
  if(ou === 'nginx') {
    // NGINX, certificat est autorise
    return res.sendStatus(201)
  }

  // Autorisation : moins un exchange (e.g. 1.public)
  try {
    const pem = req.headers['x-client-cert']
    const cert = pki.certificateFromPem(pem)
    const extensions = extraireExtensionsMillegrille(cert)
    
    const roles = extensions.roles || [],
          exchanges = extensions.niveauxSecurite || []

    if(exchanges.length === 0) {
      // Aucun exchange, acces refuse
      return res.sendStatus(401)
    }

    res.set('X-Roles', roles.join(','))
    res.set('X-Exchanges', exchanges.join(','))

    return res.sendStatus(201)
  } catch(err) {
    debug("Erreur parse certificat : %O", err)
    return res.sendStatus(401)
  }

  // Fallback - Acces refuse
  return res.sendStatus(401)
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
