const debug = require('debug')('millegrilles:authentification');
const express = require('express')

function initialiser() {
  const route = express();
  route.get('/', (req, res) => res.send('Authentification!'))

  return route
}

module.exports = {initialiser}
