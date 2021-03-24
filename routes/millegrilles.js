const debug = require('debug')('millegrilles:maitrecomptes:route');
const express = require('express')
// const session = require('express-session')
// const MemoryStore = require('memorystore')(session)
// const socketioSession = require('express-socket.io-session')
const bodyParser = require('body-parser')
// const {randomBytes, pbkdf2} = require('crypto')
// // const cookieParser = require('cookie-parser')
// const { v4: uuidv4 } = require('uuid')
//
// // const sessionsUsager = require('../models/sessions')
// const comptesUsagers = require('@dugrema/millegrilles.common/lib/dao/comptesUsagersDao')
// const topologie = require('../models/topologieDao')
// const maitreClesDao = require('../models/maitreClesDao')
// const { init: initialiserAppSocketIo, configurationEvenements } = require('../models/appSocketIo')

const {
  initialiser: initAuthentification,
  challengeRegistrationU2f,
  verifierChallengeRegistrationU2f,
  keylen,
  hashFunction} = require('./authentification')

// // Generer mot de passe temporaire pour chiffrage des cookies
// const secretCookiesPassword = uuidv4()

const hostname = process.env.HOST
debug("HOSTNAME : %s", hostname)

var idmg = null,
    proprietairePresent = false

// const sessionMiddleware = session({
//   secret: secretCookiesPassword,
//   name: 'millegrilles.sid',
//   cookie: { path: '/', domain: hostname, sameSite: 'strict', secure: true, maxAge: 3600000 },
//   store: new MemoryStore({
//     checkPeriod: 3600000 // prune expired entries every 1h
//   }),
//   saveUninitialized: true,
//   proxy: true,
//   resave: false,
// })
//
// const socketioSessionMiddleware = socketioSession(sessionMiddleware, {autoSave: true})
//
// var idmg = null, proprietairePresent = null;
//
// function initialiser(fctRabbitMQParIdmg, opts) {
//   if(!opts) opts = {}
//   const idmg = opts.idmg
//   const amqpdao = fctRabbitMQParIdmg(idmg)
//
//   debug("IDMG: %s, AMQPDAO : %s", idmg, amqpdao !== undefined)
//
//   const {injecterComptesUsagers, extraireUsager} = comptesUsagers.init(amqpdao)
//   const {injecterTopologie} = topologie.init(amqpdao)
//   const {injecterMaitreCles} = maitreClesDao.init(amqpdao)
//
//   const route = express.Router()
//
//   route.use(sessionMiddleware)
//   route.use(injecterComptesUsagers)  // Injecte req.comptesUsagers
//   route.use(injecterTopologie)       // Injecte req.topologieDao
//   route.use(injecterMaitreCles)      // Injecte req.maitreClesDao
//   // route.use(sessionsUsager.init())   // Extraction nom-usager, session
//
//   // Fonctions sous /millegrilles/api
//   route.use('/api', routeApi(extraireUsager))
//   route.use('/authentification', initAuthentification({extraireUsager}, {idmg, hostname}))
//   route.get('/info.json', infoMillegrille)
//
//   // Exposer le certificat de la MilleGrille (CA)
//   route.use('/millegrille.pem', express.static(process.env.MG_MQ_CAFILE))
//
//   ajouterStaticRoute(route)
//
//   debug("Route /millegrilles du MaitreDesComptes est initialisee")
//
//   function middleware(socket, next) {
//     debug("Middleware millegrilles socket.io connexion d'un nouveau socket, id: %s", socket.id)
//     debug("Session a l'ouverture du socket : %O", socket.handshake.session)
//
//     // Transferer methodes d'authentifications deja validees vers la session
//     const headers = socket.handshake.headers
//     debug("Request headers : %O", headers)
//     if( headers['auth-primaire'] && !session.authentificationPrimaire ) {
//       session.authentificationPrimaire = headers['auth-primaire']
//     }
//     if( headers['auth-secondaire'] && !session.authentificationSecondaire ) {
//       session.authentificationSecondaire = headers['auth-secondaire']
//     }
//
//     // Injecter comptesUsagers
//     socket.nomUsager = socket.handshake.session.nomUsager
//     injecterComptesUsagers(socket.handshake, null, ()=>{})
//     injecterMaitreCles(socket.handshake, null, ()=>{})
//     socket.comptesUsagers = socket.handshake.comptesUsagers
//     socket.hostname = socket.handshake.headers.host
//
//     next()
//   }
//
//   // Fonction qui permet d'activer Socket.IO pour l'application
//   const socketio = {middleware, configurationEvenements}
//   // Initialiser webauthn (register, verify) pour socket.io
//   initialiserAppSocketIo(hostname, idmg)
//
//   // Retourner dictionnaire avec route pour server.js
//   return {route, socketio, session: socketioSessionMiddleware}
// }

function routeApi() {
  const route = express.Router()
  route.use(bodyParser.json())
  route.get('/applications.json', listeApplications)

  return route
}

async function infoMillegrille(req, res, next) {
  // Verifie si la MilleGrille est initialisee. Conserve le IDMG

  if( ! idmg ) {
    // Conserver idmg dans une variable globale
    idmg = req.amqpdao.pki.idmg
  }

  if( ! proprietairePresent ) {
    // Faire une requete pour recuperer l'information
    const domaineAction = 'MaitreDesComptes.infoProprietaire'
    const requete = {}
    debug("Requete info proprietaire")
    const compteProprietaire = await req.amqpdao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    debug("Reponse compte proprietaire")
    debug(compteProprietaire)

    if(compteProprietaire.webauthn) {
      // Conserver dans une variable globale, evite une requete sur le compte
      // du proprietaire a chaque fois pour verifier
      proprietairePresent = true
    } else {
      proprietairePresent = false
    }
  }

  const reponse = { idmg, proprietairePresent }

  res.send(reponse)
}

async function listeApplications(req, res, next) {
  const nomUsager = req.nomUsager
  const sessionUsager = req.session

  var niveauSecurite = sessionUsager.niveauSecurite || '1.public'
  debug("Demande liste applications niveau %s", niveauSecurite)

  const topologieDao = req.topologieDao
  const applications = await topologieDao.getListeApplications(niveauSecurite)
  debug("Liste applications recues: \n%O", applications)

  var liste = applications.map(app=>{
    return {
      url: app.url,
      nom: app.application,
      nomFormatte: app.application,
      securite: app.securite,
    }
  })

  res.send(liste)
}
//
// module.exports = {initialiser}

// const debug = require('debug')('millegrilles:maitrecomptes:route');
// const express = require('express')

// const { configurationEvenements } = require('../models/appSocketIo')
// const { GrosFichiersDao } = require('../models/grosFichiersDao')

function initialiser(amqpdao, extraireUsager, opts) {
  if(!opts) opts = {}
  const idmg = amqpdao.pki.idmg
  debug("IDMG: %s, AMQPDAO : %s", idmg, amqpdao !== undefined)

  const route = express.Router()
  // route.get('/info.json', routeInfo)

  // !!!

  // Fonctions sous /millegrilles/api
  route.use('/api', routeApi())
  route.use('/authentification', initAuthentification({extraireUsager}, {idmg, hostname}))
  route.get('/info.json', infoMillegrille)

  // Exposer le certificat de la MilleGrille (CA)
  route.use('/millegrille.pem', express.static(process.env.MG_MQ_CAFILE))

  ajouterStaticRoute(route)

  // function middleware(socket, next) {
  //   debug("Middleware millegrilles socket.io connexion d'un nouveau socket, id: %s", socket.id)
  //   debug("Session a l'ouverture du socket : %O", socket.handshake.session)
  //
  //   // Transferer methodes d'authentifications deja validees vers la session
  //   const headers = socket.handshake.headers
  //   debug("Request headers : %O", headers)
  //   if( headers['auth-primaire'] && !session.authentificationPrimaire ) {
  //     session.authentificationPrimaire = headers['auth-primaire']
  //   }
  //   if( headers['auth-secondaire'] && !session.authentificationSecondaire ) {
  //     session.authentificationSecondaire = headers['auth-secondaire']
  //   }
  //
  //   // Injecter comptesUsagers
  //   socket.nomUsager = socket.handshake.session.nomUsager
  //   socket.comptesUsagers = socket.handshake.comptesUsagers
  //   socket.hostname = socket.handshake.headers.host
  //
  //   // injecterComptesUsagers(socket.handshake, null, ()=>{})
  //   // injecterMaitreCles(socket.handshake, null, ()=>{})
  //
  //   next()
  // }

  // Fonction qui permet d'activer Socket.IO pour l'application
  // const socketio = {middleware, configurationEvenements}
  // Initialiser webauthn (register, verify) pour socket.io
  // initialiserAppSocketIo(hostname, idmg)

  // Retourner dictionnaire avec route pour server.js
  // return {route, socketio, session: socketioSessionMiddleware}

  // !!!


  // ajouterStaticRoute(route)

  debug("Route /millegrilles de maitre des comptes est initialisee")
  return route
}

function ajouterStaticRoute(route) {
  // Route utilisee pour transmettre fichiers react de la messagerie en production
  var folderStatic =
    process.env.MG_STATIC_RES ||
    'static/millegrilles'

  route.use(express.static(folderStatic))
  debug("Route %s pour millegrilles initialisee", folderStatic)
}

function routeInfo(req, res, next) {
  debug(req.headers)
  const idmg = req.amqpdao.pki.idmg
  const nomUsager = req.headers['user-name']
  const userId = req.headers['user-id']
  const niveauSecurite = req.headers['user-securite']
  const host = req.headers.host

  const reponse = {idmg, nomUsager, userId, hostname: host, niveauSecurite}
  return res.send(reponse)
}

module.exports = {initialiser}
