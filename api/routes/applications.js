const debug = require('debug')('millegrilles:apps');
const express = require('express')
const bodyParser = require('body-parser')

function initialiser() {
  const route = express();
  route.use(bodyParser.json())

  route.post('/changerMotdepasse', changerMotDePasse)
  route.post('/ajouterU2f', ajouterU2f)

  return route
}

function changerMotDePasse(req, res, next) {
  debug("Changer mot de passe usager %s", req.nomUsager)
  const infoPasswords = debug(req.body)
  res.sendStatus(500)
}

function ajouterU2f(req, res, next) {
  debug("Ajouter cle U2F pour usager %s", req.nomUsager)
  res.sendStatus(500)
}

module.exports = {initialiser}
