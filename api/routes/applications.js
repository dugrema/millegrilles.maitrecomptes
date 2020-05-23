const debug = require('debug')('millegrilles:apps');
const express = require('express')
const bodyParser = require('body-parser')
const {keylen, hashFunction} = require('./authentification')
const {randomBytes, pbkdf2} = require('crypto')

function initialiser() {
  const route = express();
  route.use(bodyParser.json())

  route.post('/changerMotdepasse', changerMotDePasse)
  route.post('/ajouterU2f', ajouterU2f)

  return route
}

function changerMotDePasse(req, res, next) {
  const nomUsager = req.nomUsager
  const infoCompteUsager = req.compteUsager

  debug("Changer mot de passe usager %s", nomUsager)
  const {motdepasseActuelHash, motdepasseNouveau} = req.body
  var {motdepasseHash, iterations, salt} = infoCompteUsager

  pbkdf2(motdepasseActuelHash, salt, iterations, keylen, hashFunction, (err, derivedKey) => {
    if (err) return res.sendStatus(500);

    const hashPbkdf2MotdepasseActuel = derivedKey.toString('base64')
    debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseActuel, iterations, salt)

    if(hashPbkdf2MotdepasseActuel === motdepasseHash) {
      // Le mot de passe actuel correspond au hash recu, on applique le changement

      // Generer nouveau salt et nombre d'iterations
      salt = randomBytes(128).toString('base64')
      iterations = Math.floor(Math.random() * 50000) + 75000

      pbkdf2(motdepasseNouveau, salt, iterations, keylen, hashFunction, (err2, derivedNewKey) => {
        if (err2) return res.sendStatus(500);

        const hashPbkdf2MotdepasseNouveau = derivedNewKey.toString('base64')
        debug("Rehash du nouveau hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseActuel, iterations, salt)

        infoCompteUsager.salt = salt
        infoCompteUsager.iterations = iterations
        infoCompteUsager.motdepasseHash = hashPbkdf2MotdepasseNouveau
        req.comptesUsagers.setCompte(nomUsager, infoCompteUsager)

        return res.sendStatus(200)  // OK
      })

    } else {
      console.error("Mismatch mot de passe courant")
      return res.sendStatus(403)
    }

  })

}

function ajouterU2f(req, res, next) {
  debug("Ajouter cle U2F pour usager %s", req.nomUsager)
  res.sendStatus(500)
}

module.exports = {initialiser}
