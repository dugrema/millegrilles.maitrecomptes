const debug = require('debug')('millegrilles:prive');
const express = require('express')

var authentifie_test = false;

function initialiser() {
  const route = express();
  route.get('/', (req, res) => {
    res.send('Section privee');
    debug("section privee, headers : ")
    debug(req.headers)
  })

  return route
}

module.exports = {initialiser}
