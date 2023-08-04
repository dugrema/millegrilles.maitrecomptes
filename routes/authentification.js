// Route pour authentifier les usagers
// Toutes les fonctions de cette route sont ouvertes (aucune authentification requise)

const debug = require('debug')('maitrecomptes:authentification')
const debugVerif = require('debug')('maitrecomptes:verification')
const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')

const { init: initWebauthn } = require('@dugrema/millegrilles.nodejs/src/webauthn')

const CONST_URL_ERREUR_MOTDEPASSE = '/millegrilles?erreurMotdepasse=true'

const ipLock = process.env.DESACTIVER_IP_LOCK?false:true

const SECRET = "unSecret1234",
      COOKIE_SESSION = 'mgsession'

function initialiser(middleware, hostname, idmg, opts) {
  opts = opts || {}

  debug("Initialiser authentification hostname %s, idmg %s, opts : %O", hostname, idmg, opts)

  // Initialiser verification webauthn
  initWebauthn(hostname, idmg)

  const route = express.Router()

  // const corsFedere = configurerCorsFedere()
  const bodyParserJson = bodyParser.json()

  route.use(headersNoCache)
  route.use(cookieParser(SECRET))

  // Routes sans body
  route.get('/authentification/verifier', verifierAuthentification)
  route.get('/authentification/verifier_tlsclient', verifierTlsClient)
  route.get('/authentification/cookie', getCookieSession)
  route.get('/authentification/fermer', fermer)

  route.use(bodyParserJson)  // Pour toutes les routes suivantes, on fait le parsing json

  // Toutes les routes suivantes assument que l'usager est deja identifie
  route.use(middleware.extraireUsager)

  // Acces refuse
  route.get('/authentification/refuser.html', (req, res) => {
    res.redirect(CONST_URL_ERREUR_MOTDEPASSE);
  })

  return route
}

async function verifierAuthentification(req, res) {
  let verificationOk = false

  try {
    debugVerif("verifierAuthentification : headers = %O\nsession = %O", req.headers, req.session)

    const sessionUsager = req.session,
          cookies = req.signedCookies || {},
          cookieSession = cookies[COOKIE_SESSION]

    // res.set('Cache-Control', 'no-store')

    if(cookieSession) {
      debugVerif("Cookie de session trouve : ", cookieSession)
      const contenuCookie = JSON.parse(cookieSession)
      const { user_id: userId, hostname, challenge } = contenuCookie
      let nomUsager = null

      const cleSession = `cookie:${challenge}`

      // TODO : verifier avec redis/mongo
      const requete = { ...contenuCookie }
      const domaine = 'CoreMaitreDesComptes', action = 'getCookieUsager'
      try {
        let cookieCharge = null, redisExiste = false
        // Charger le cookie a partir de redis
        debug("Verifier presence du cookie '%s' dans redis", cleSession)
        const reponseRedis = await req.redisClientSession.get(''+cleSession)
        debug("Reponse cookie redis : %O", reponseRedis)
        if(reponseRedis) {
          cookieCharge = JSON.parse(reponseRedis)
          redisExiste = true
        } else {
          // Fallback, verifier dans le back-end
          debug("Fallback, requete vers MQ : ", requete)
          const resultat = await req.amqpdao.transmettreRequete(domaine, requete, {action, ajouterCertificat: true})
          debug("Resultat requete : ", resultat)
          if(resultat.ok) {
            cookieCharge = resultat
          }
        }

        if(cookieCharge) {
          nomUsager = cookieCharge.nomUsager

          // Sauvegarder le cookie dans redis
          const expiration = Math.floor(contenuCookie.expiration - (new Date().getTime()/1000))
          if(expiration > 0) {
            // await req.redisClientSession.set(
            //   cleSession, JSON.stringify(valeurCookie), {NX: true, EX: ''+expiration})
            if(!redisExiste) {
              const valeurCookie = {nomUsager, cookie: contenuCookie}
              debug("Sauvegarde cookie %s dans redis %O (TTL: %O)", cleSession, valeurCookie, expiration)
              await req.redisClientSession.set(cleSession, JSON.stringify(valeurCookie), {NX: true, EX: ''+expiration})
            }
            verificationOk = true
          } else {
            debug("Cookie expire : %s", expiration)
          }
        }
      } catch(err) {
        console.warn(new Date()  + " Erreur verification cookie avec MQ ", err)
      }

      if(verificationOk) {
        res.set('X-User-Id', contenuCookie.user_id)
        res.set('X-User-Name', nomUsager)
        res.set('X-User-AuthScore', 2)

        // Remise en place de l'information de session
        sessionUsager.userId = contenuCookie.user_id
        if(nomUsager) sessionUsager.nomUsager = nomUsager
        sessionUsager.auth = sessionUsager.auth || {}
        sessionUsager.auth.cookie = 2
        sessionUsager.save()
      }

    } else if(sessionUsager) {
      let {userId, nomUsager, auth} = sessionUsager

      if(!auth || auth.length === 0) {
        debugVerif("Usager n'est pas authentifie")
        return res.sendStatus(401)
      }

      debugVerif("OK - usager authentifie : %s", nomUsager)

      // L'usager est authentifie, verifier IP client
      if(ipLock && sessionUsager.ipClient !== req.headers['x-forwarded-for']) {
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
  } catch(err) {
    console.warn(new Date() + " verifierAuthentification ERROR ", err)
    res.sendStatus(500)
  }
}

function verifierTlsClient(req, res) {
  debugVerif("verifierAuthentification : headers = %O", req.headers)

  const nginxVerified = req.headers['verified'] || ''

  if(nginxVerified.toLowerCase() !== 'success') {
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

  // Autorisation : moins un exchange (e.g. 1.public)
  try {
    const ou = subjectDns['OU'] || ''
    if(ou.toLowerCase() === 'nginx') {
      // Relai via NGINX, certificat est autorise
      return res.sendStatus(201)
    }

    // Note : a partir de nodejs 16.16.0, brise. On ne recoit plus le
    //        certificat via header. Voir si possible de corriger via POST.
    // On va accepter n'importe quel certificat avec un OU

    // Faire une liste de OU qui sont refuses
    if(!ou) return res.sendStatus(401)
    if(['usager'].includes(ou)) return res.sendStatus(401)

    // Accepter les autres
    return res.sendStatus(200)

  } catch(err) {
    debug("Erreur parse certificat : %O", err)
    return res.sendStatus(401)
  }

}

function fermer(req, res) {
  invaliderCookieAuth(req)
  res.redirect('/millegrilles');
}

function invaliderCookieAuth(req) {
  req.session.destroy()
}

function getCookieSession(req, res) {
  debug("Get cookie session")
  const session = req.session

  debug("!!! SESSION ", session)
  const cookieSession = session.cookieSession

  if(!cookieSession) {
    return res.sendStatus(409)
  }

  // Retirer le cookie de session
  delete session.cookieSession

  const cookieString = JSON.stringify(cookieSession)
  const timestamp = new Date().getTime() / 1000
  const maxAge = (cookieSession.expiration - timestamp) * 1000
  res.cookie(COOKIE_SESSION, cookieString, {maxAge, signed: true, httpOnly: true, secure: true, sameSite: 'strict'})

  res.sendStatus(200)
}

function calculerAuthScore(auth) {
  if(!auth) return 0
  const score = Object.values(auth)
    .reduce((score, item)=>{return score + item}, 0)
  return score
}

function headersNoCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

module.exports = {
  initialiser,
}
