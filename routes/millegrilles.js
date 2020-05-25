const debug = require('debug')('millegrilles:apps');
const express = require('express')
const bodyParser = require('body-parser')
const {randomBytes, pbkdf2} = require('crypto')
const {
  initialiser: initAuthentification,
  challengeRegistrationU2f,
  verifierChallengeRegistrationU2f,
  keylen,
  hashFunction} = require('./authentification')

function initialiser(middleware) {
  const route = express();

  const {extraireUsager} = middleware

  // Fonctions sous /millegrilles/api
  route.use('/api', routeApi(middleware))
  route.use('/authentification', extraireUsager, initAuthentification())

  return route
}

function routeApi(middleware) {
  // Parse middleware en parametre
  // extraireUsager : injecte req.compteUsager
  const {extraireUsager} = middleware

  const route = express();
  route.use(bodyParser.json())
  route.post('/challengeRegistrationU2f', challengeRegistrationU2f)
  route.post('/ajouterU2f', ajouterU2f)
  route.post('/ajouterMotdepasse', extraireUsager, ajouterMotdepasse)
  route.post('/changerMotdepasse', extraireUsager, changerMotDePasse)
  route.post('/desactiverMotdepasse', extraireUsager, desactiverMotdepasse)
  route.post('/desactiverU2f', extraireUsager, desactiverU2f)

  return route
}

function ajouterMotdepasse(req, res, next) {
  const nomUsager = req.nomUsager
  var infoCompteUsager = req.compteUsager

  // Verifier si un mot de passe existe deja
  if(infoCompteUsager.motdepasse) {
    debug("Mot de passe existe deja, il faut utiliser le formulaire de changement")
    return res.sendStatus(403);
  } else {
    const {motdepasseNouveau} = req.body

    genererMotdepasse(motdepasseNouveau)
    .then(infoMotdepasse => {
      req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse)
      return res.sendStatus(200)  // OK
    })
    .catch(err=>{
      console.error("Erreur hachage mot de passe")
      console.error(err)
      return res.sendStatus(500)
    })
  }

}

function changerMotDePasse(req, res, next) {
  const nomUsager = req.nomUsager
  var infoCompteUsager = req.compteUsager.motdepasse

  debug("Changer mot de passe usager %s", nomUsager)
  debug(infoCompteUsager)
  const {motdepasseActuelHash, motdepasseNouveau} = req.body
  var {motdepasseHash, iterations, salt} = infoCompteUsager

  pbkdf2(motdepasseActuelHash, salt, iterations, keylen, hashFunction, (err, derivedKey) => {
    if (err) return res.sendStatus(500);

    const hashPbkdf2MotdepasseActuel = derivedKey.toString('base64')
    debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseActuel, iterations, salt)

    if(hashPbkdf2MotdepasseActuel === motdepasseHash) {
      // Le mot de passe actuel correspond au hash recu, on applique le changement

      // Generer nouveau salt, iterations et hachage
      genererMotdepasse(motdepasseNouveau)
      .then(infoMotdepasse => {
        req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse)
        return res.sendStatus(200)  // OK
      })
      .catch(err=>{
        console.error("Erreur hachage mot de passe")
        console.error(err)
        return res.sendStatus(500)
      })

    } else {
      console.error("Mismatch mot de passe courant")
      return res.sendStatus(403)
    }

  })

}

function genererMotdepasse(motdepasseNouveau) {
  // Generer nouveau salt et nombre d'iterations
  salt = randomBytes(128).toString('base64')
  iterations = Math.floor(Math.random() * 50000) + 75000

  return new Promise((resolve, reject) => {
    pbkdf2(motdepasseNouveau, salt, iterations, keylen, hashFunction, (err, derivedNewKey) => {
      if (err) reject(err);

      const motdepasseHash = derivedNewKey.toString('base64')
      debug("Rehash du nouveau hash avec pbkdf2 : %s (iterations: %d, salt: %s)", motdepasseHash, iterations, salt)

      const info = {
        salt,
        iterations,
        motdepasseHash,
      }
      resolve(info)
    })
  })
}

function ajouterU2f(req, res, next) {
  debug("Ajouter cle U2F pour usager %s", req.nomUsager)
  debug(req.body)

  const nomUsager = req.nomUsager

  const {challengeId, credentials, desactiverAutres} = req.body
  const key = verifierChallengeRegistrationU2f(challengeId, credentials)

  if(key) {
    debug("Challenge registration OK pour usager %s", nomUsager)
    req.comptesUsagers.ajouterCle(nomUsager, key, desactiverAutres)
    return res.sendStatus(200)
  } else {
    return res.sendStatus(403)
  }
}

function desactiverMotdepasse(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager

    debug(userInfo)

    // S'assurer qu'il y a des cles
    if(userInfo.cles && userInfo.cles.length > 0) {
      req.comptesUsagers.supprimerMotdepasse(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle U2F, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

function desactiverU2f(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager

    debug(userInfo)

    // S'assurer qu'il y a des cles
    if(userInfo.motdepasse) {
      req.comptesUsagers.supprimerCles(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle U2F, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

module.exports = {initialiser}
