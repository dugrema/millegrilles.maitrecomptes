const debug = require('debug')('millegrilles:authentification');
const express = require('express')
const cookieParser = require('cookie-parser')

function initialiser(secretCookiesPassword) {
  const route = express();
  route.use(cookieParser(secretCookiesPassword));
  return route
}

module.exports = {initialiser}
