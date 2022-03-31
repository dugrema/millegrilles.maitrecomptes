// Route pour authentifier les usagers
// Toutes les fonctions de cette route sont ouvertes (aucune authentification requise)

const debug = require('debug')('millegrilles:maitrecomptes:authentification')
const debugVerif = require('debug')('millegrilles:maitrecomptes:verification')
const express = require('express')
const bodyParser = require('body-parser')

const { pki } = require('@dugrema/node-forge')
const { extraireExtensionsMillegrille } = require('@dugrema/millegrilles.utiljs/src/forgecommon')
const { init: initWebauthn } = require('@dugrema/millegrilles.nodejs/src/webauthn')

const CONST_URL_ERREUR_MOTDEPASSE = '/millegrilles?erreurMotdepasse=true'

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
  const ou = subjectDns['OU'] || ''
  if(ou.toLowercase() === 'nginx') {
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

function fermer(req, res) {
  invaliderCookieAuth(req)
  res.redirect('/millegrilles');
}

function invaliderCookieAuth(req) {
  req.session.destroy()
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
