const debug = require('debug')('millegrilles:app');
const express = require('express')
const routeAuthentification = require('./routes/authentification');
const routePrivee = require('./routes/prive');

function initialiserApp() {
  const app = express()
  app.get('/', (req, res) => res.send('Hello World!'))
  app.use('/authentification', routeAuthentification.initialiser())
  app.use('/prive', routePrivee.initialiser())

  return app;
}

module.exports = {initialiserApp};
