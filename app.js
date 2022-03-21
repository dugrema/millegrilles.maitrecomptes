const debug = require('debug')('millegrilles:app')
const express = require('express')

const routeMillegrilles = require('./routes/millegrilles')
const comptesUsagers = require('./models/comptesUsagers')
const amqpdao = require('./models/amqpdao')

async function initialiserApp() {
  const app = express()

  const {middleware: amqMiddleware, amqpdao: instAmqpdao} = await amqpdao.init()  // Connexion AMQ
  const {injecterComptesUsagers, extraireUsager} = comptesUsagers.init(instAmqpdao)

  // app.use(logger('dev'))  // http logger

  app.use(injecterComptesUsagers)  // Injecte req.comptesUsagers
  app.use(amqMiddleware)           // Injecte req.amqpdao

  // Par defaut ouvrir l'application React de MilleGrilles
  app.get('/', (_req, res) => res.redirect('/millegrilles'))

  // Route authentification - noter qu'il n'y a aucune protection sur cette
  // route. Elle doit etre utilisee en assumant que toute l'information requise
  // pour l'authentification est inclus dans les requetes ou que l'information
  // retournee n'est pas privilegiee.
  app.use('/millegrilles', routeMillegrilles.initialiser({extraireUsager}))

  debug("Application MaitreDesComptes initialisee")

  return app
}

module.exports = {initialiserApp}
