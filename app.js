const debug = require('debug')('millegrilles:app')
const express = require('express')
const cookieParser = require('cookie-parser')
const { v4: uuidv4 } = require('uuid')

// const routeAuthentification = require('./routes/authentification')
const routeMillegrilles = require('./routes/millegrilles')
const sessionsUsager = require('./models/sessions')
const comptesUsagers = require('./models/comptesUsagers')
const amqpdao = require('./models/amqpdao')

const routePrivee = require('./routes/prive')

// Generer mot de passe temporaire pour chiffrage des cookies
const secretCookiesPassword = uuidv4()

async function initialiserApp() {
  const app = express()

  const {middleware: amqMiddleware, amqpdao: instAmqpdao} = await amqpdao.init()  // Connexion AMQ
  const {injecterComptesUsagers, extraireUsager} = comptesUsagers.init(instAmqpdao)

  app.use(cookieParser(secretCookiesPassword))
  app.use(injecterComptesUsagers)  // Injecte req.comptesUsagers
  app.use(amqMiddleware)           // Injecte req.amqpdao
  app.use(sessionsUsager.init())   // Extraction nom-usager, session

  // Par defaut ouvrir l'application React de MilleGrilles
  app.get('/', (req, res) => res.redirect('/millegrilles'))

  // Route authentification - noter qu'il n'y a aucune protection sur cette
  // route. Elle doit etre utilisee en assumant que toute l'information requise
  // pour l'authentification est inclus dans les requetes ou que l'information
  // retournee n'est pas privilegiee.
  app.use('/millegrilles', routeMillegrilles.initialiser({extraireUsager}))

  // API pour applications authentifiees (e.g. React)
  // app.use('/apps', routeApplications.initialiser({extraireUsager}))

  // Test
  app.use('/prive', routePrivee.initialiser())

  debug("Application MaitreDesComptes initialisee")

  return app
}

module.exports = {initialiserApp}
