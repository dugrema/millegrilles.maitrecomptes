const debug = require('debug')('millegrilles:maitrecomptes:route');
const express = require('express')
const session = require('express-session')
const MemoryStore = require('memorystore')(session)
const socketioSession = require('express-socket.io-session')
const bodyParser = require('body-parser')
const {randomBytes, pbkdf2} = require('crypto')
// const cookieParser = require('cookie-parser')
const { v4: uuidv4 } = require('uuid')

// const sessionsUsager = require('../models/sessions')
const comptesUsagers = require('../models/comptesUsagers')
const topologie = require('../models/topologieDao')
const { initialiserSocket, configurationEvenements } = require('../models/appSocketIo')

const {
  initialiser: initAuthentification,
  challengeRegistrationU2f,
  verifierChallengeRegistrationU2f,
  keylen,
  hashFunction} = require('./authentification')

const { initialiser: initOpenid } = require('./openid')

// Generer mot de passe temporaire pour chiffrage des cookies
const secretCookiesPassword = uuidv4()
const hostname = process.env.HOST

debug("HOSTNAME : %s", hostname)

const sessionMiddleware = session({
  secret: secretCookiesPassword,
  cookie: { path: '/', domain: hostname, sameSite: 'strict', secure: true, maxAge: 3600000 },
  store: new MemoryStore({
    checkPeriod: 3600000 // prune expired entries every 1h
  }),
  proxy: true,
  resave: false,
})

const socketioSessionMiddleware = socketioSession(sessionMiddleware, {autoSave: true})

var idmg = null, proprietairePresent = null;

function initialiser(fctRabbitMQParIdmg, opts) {
  if(!opts) opts = {}
  const idmg = opts.idmg
  const amqpdao = fctRabbitMQParIdmg(idmg)

  debug("IDMG: %s, AMQPDAO : %s", idmg, amqpdao !== undefined)

  const {injecterComptesUsagers, extraireUsager} = comptesUsagers.init(amqpdao)
  const {injecterTopologie} = topologie.init(amqpdao)

  const route = express();

  route.use(sessionMiddleware)
  route.use(injecterComptesUsagers)  // Injecte req.comptesUsagers
  route.use(injecterTopologie)       // Injecte req.topologieDao
  // route.use(sessionsUsager.init())   // Extraction nom-usager, session

  // Fonctions sous /millegrilles/api
  route.use('/api', routeApi(extraireUsager))
  // route.use('/openid', initOpenid(fctRabbitMQParIdmg, opts))
  route.use('/authentification', initAuthentification({extraireUsager}))
  route.get('/info.json', infoMillegrille)

  // Exposer le certificat de la MilleGrille (CA)
  route.use('/millegrille.pem', express.static(process.env.MG_MQ_CAFILE))

  ajouterStaticRoute(route)

  debug("Route /millegrilles du MaitreDesComptes est initialisee")

  function ajouterComptesUsagersSocketIo(socket) {
    injecterComptesUsagers(socket.handshake, null, ()=>{})
  }

  function addSocket(socket) {
    debug("WSS connexion d'un nouveau socket, id: %s", socket.id)
    debug(socket.handshake.session)

    // Injecter comptesUsagers
    socket.nomUsager = socket.handshake.session.nomUsager
    injecterComptesUsagers(socket.handshake, null, ()=>{})
    socket.comptesUsagers = socket.handshake.comptesUsagers
    socket.hostname = socket.handshake.headers.host

  }

  // Fonction qui permet d'activer Socket.IO pour l'application
  const socketio = {addSocket, session: socketioSessionMiddleware}

  // Retourner dictionnaire avec route pour server.js
  return {route, socketio, configurationEvenements}
}

function ajouterStaticRoute(route) {
  var folderStatic =
    process.env.MG_MILLEGRILLES_STATIC_RES ||
    process.env.MG_STATIC_RES ||
    'static/millegrilles'

  route.use(express.static(folderStatic))
}

function routeApi(extraireUsager) {
  // extraireUsager : injecte req.compteUsager
  const route = express();
  route.use(bodyParser.json())
  // route.post('/challengeRegistrationU2f', challengeRegistrationU2f)
  // route.post('/ajouterU2f', ajouterU2f)
  // route.post('/ajouterMotdepasse', extraireUsager, ajouterMotdepasse)
  // route.post('/changerMotdepasse', extraireUsager, changerMotDePasse)
  // route.post('/desactiverMotdepasse', extraireUsager, desactiverMotdepasse)
  // route.post('/desactiverU2f', extraireUsager, desactiverU2f)
  // route.post('/associerIdmg', associerIdmg)

  route.get('/applications.json', listeApplications)

  return route
}

async function infoMillegrille(req, res, next) {
  // Verifie si la MilleGrille est initialisee. Conserve le IDMG

  if( ! idmg ) {
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

    if(compteProprietaire.u2f) {
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

  var securite = '2.prive' // Par defaut niveau prive
  if(sessionUsager.estProprietaire) {
    securite = '3.protege'
  }
  debug("Demande liste applications niveau %s", securite)

  const topologieDao = req.topologieDao
  const applications = await topologieDao.getListeApplications(securite)
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

module.exports = {initialiser}
