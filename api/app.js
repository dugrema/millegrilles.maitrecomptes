const debug = require('debug')('millegrilles:app');
const express = require('express')
const { v4: uuidv4 } = require('uuid');

const routeAuthentification = require('./routes/authentification');
const routeApplications = require('./routes/applications');

const routePrivee = require('./routes/prive');

// Generer mot de passe temporaire pour chiffrage des cookies
const secretCookiesPassword = uuidv4();

function initialiserApp() {
  const app = express()
  app.get('/', (req, res) => res.send('Hello World!'))

  // Route authentification - noter qu'il n'y a aucune protection sur cette
  // route. Elle doit etre utilisee en assumant que toute l'information requise
  // pour l'authentification est inclus dans les requetes ou que l'information
  // retournee n'est pas privilegiee.
  app.use('/authentification', routeAuthentification.initialiser(secretCookiesPassword))

  // Pour applications authentifiees, extraire l'usager du header
  app.use(extraireUsager)
  app.use('/apps', routeApplications.initialiser(secretCookiesPassword))

  // Test
  app.use('/prive', routePrivee.initialiser())

  return app;
}

function extraireUsager(req, res, next) {

  // debug("extraire usager")
  const nomUsager = req.headers['remote-user']
  if(nomUsager) {
    req.nomUsager = nomUsager
    debug('Nom usager %s', nomUsager)
  }

  return next()
}

module.exports = {initialiserApp};
