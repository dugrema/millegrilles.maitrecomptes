const debug = require('debug')('millegrilles:app');
const express = require('express')
const cookieParser = require('cookie-parser')
const { v4: uuidv4 } = require('uuid');

const routeAuthentification = require('./routes/authentification');
const routeApplications = require('./routes/applications');
const sessionsUsager = require('./models/sessions')
const comptesUsagers = require('./models/comptesUsagers')

const routePrivee = require('./routes/prive');

// Generer mot de passe temporaire pour chiffrage des cookies
const secretCookiesPassword = uuidv4();

function initialiserApp() {
  const app = express()

  app.use(cookieParser(secretCookiesPassword))
  app.use(sessionsUsager.init())  // Extraction nom-usager
  app.use(comptesUsagers.init())  // Acces aux comptes usagers

  // Route authentification - noter qu'il n'y a aucune protection sur cette
  // route. Elle doit etre utilisee en assumant que toute l'information requise
  // pour l'authentification est inclus dans les requetes ou que l'information
  // retournee n'est pas privilegiee.
  app.use('/authentification', routeAuthentification.initialiser())

  // Pour applications authentifiees
  app.use('/apps', routeApplications.initialiser())

  // Test
  app.use('/prive', routePrivee.initialiser())
  app.get('/', (req, res) => res.send('Hello World!'))

  return app;
}

module.exports = {initialiserApp};
