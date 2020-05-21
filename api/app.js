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
  app.use('/authentification', routeAuthentification.initialiser(secretCookiesPassword))
  app.use('/apps', routeApplications.initialiser(secretCookiesPassword))

  // Test
  app.use('/prive', routePrivee.initialiser())

  return app;
}

module.exports = {initialiserApp};
