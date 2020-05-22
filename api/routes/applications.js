const debug = require('debug')('millegrilles:apps');
const express = require('express')
const cookieParser = require('cookie-parser')

function initialiser(secretCookiesPassword) {
  const route = express();
  route.use(cookieParser(secretCookiesPassword));

  route.get('/changerMotdepasse', changerMotDePasse)
  route.get('/ajouterU2f', ajouterU2f)

  return route
}

function changerMotDePasse(req, res, next) {
  debug("Changer mot de passe usager %s", req.nomUsager)
  res.sendStatus(500)
}

function ajouterU2f(req, res, next) {
  debug("Ajouter cle U2F pour usager %s", req.nomUsager)
  res.sendStatus(500)
}

module.exports = {initialiser}
