const debug = require('debug')('millegrilles:maitrecomptes:route');
const express = require('express')
const session = require('express-session')
const bodyParser = require('body-parser')
const {randomBytes, pbkdf2} = require('crypto')
// const cookieParser = require('cookie-parser')
const { v4: uuidv4 } = require('uuid')

// const sessionsUsager = require('../models/sessions')
const comptesUsagers = require('../models/comptesUsagers')

// Generer mot de passe temporaire pour chiffrage des cookies
const secretCookiesPassword = uuidv4()

const sessionMiddleware = session({
  secret: secretCookiesPassword,
  cookie: { path: '/', sameSite: 'strict', secure: true },
  proxy: true,
  resave: false,
})

const {
  initialiser: initAuthentification,
  challengeRegistrationU2f,
  verifierChallengeRegistrationU2f,
  keylen,
  hashFunction} = require('./authentification')

var idmg = null, proprietairePresent = null;

function initialiser(fctRabbitMQParIdmg, opts) {
  if(!opts) opts = {}
  const idmg = opts.idmg
  const amqpdao = fctRabbitMQParIdmg(idmg)

  debug("IDMG: %s, AMQPDAO : %s", idmg, amqpdao !== undefined)

  const {injecterComptesUsagers, extraireUsager} = comptesUsagers.init(amqpdao)

  const route = express();

  route.use(sessionMiddleware)
  route.use(injecterComptesUsagers)  // Injecte req.comptesUsagers
  // route.use(sessionsUsager.init())   // Extraction nom-usager, session

  // Fonctions sous /millegrilles/api
  route.use('/api', routeApi(extraireUsager))
  route.use('/authentification', initAuthentification({extraireUsager}))
  route.get('/info.json', infoMillegrille)

  // Exposer le certificat de la MilleGrille (CA)
  route.use('/millegrille.pem', express.static(process.env.MG_MQ_CAFILE))

  ajouterStaticRoute(route)

  debug("Route /millegrilles du MaitreDesComptes est initialisee")

  // Retourner dictionnaire avec route pour server.js
  return {route}
}

function ajouterStaticRoute(route) {
  var folderStatic =
    process.env.MG_MILLEGRILLES_STATIC_RES ||
    process.env.MG_STATIC_RES ||
    'static/millegrilles'

  route.use(express.static(folderStatic))
}

function routeApi(extraireUsager) {
  // extraireUsager : injecte req.compteUsager
  const route = express();
  route.use(bodyParser.json())
  route.post('/challengeRegistrationU2f', challengeRegistrationU2f)
  route.post('/ajouterU2f', ajouterU2f)
  route.post('/ajouterMotdepasse', extraireUsager, ajouterMotdepasse)
  route.post('/changerMotdepasse', extraireUsager, changerMotDePasse)
  route.post('/desactiverMotdepasse', extraireUsager, desactiverMotdepasse)
  route.post('/desactiverU2f', extraireUsager, desactiverU2f)
  route.post('/associerIdmg', associerIdmg)

  route.get('/applications.json', listeApplications)

  return route
}

async function infoMillegrille(req, res, next) {
  // Verifie si la MilleGrille est initialisee. Conserve le IDMG

  if( ! idmg ) {
    idmg = req.amqpdao.pki.idmg
  }

  if( ! proprietairePresent ) {
    // Faire une requete pour recuperer l'information
    const domaineAction = 'MaitreDesComptes.infoProprietaire'
    const requete = {}
    debug("Requete info proprietaire")
    const compteProprietaire = await req.amqpdao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    debug("Reponse compte proprietaire")
    debug(compteProprietaire)

    if(compteProprietaire.u2f) {
      proprietairePresent = true
    } else {
      proprietairePresent = false
    }
  }

  const reponse = { idmg, proprietairePresent }

  res.send(reponse)
}

function ajouterMotdepasse(req, res, next) {
  var infoCompteUsager = req.compteUsager

  // Verifier si un mot de passe existe deja
  if(infoCompteUsager.motdepasse) {
    debug("Mot de passe existe deja, il faut utiliser le formulaire de changement")
    return res.sendStatus(403);
  } else {
    const {motdepasseNouveau} = req.body
    var nomUsager = req.nomUsager

    const estProprietaire = req.sessionUsager.estProprietaire
    if(estProprietaire && req.body['nom-usager']) {
      nomUsager = req.body['nom-usager']
    }

    genererMotdepasse(motdepasseNouveau)
    .then(infoMotdepasse => {
      req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse, estProprietaire)
      if(estProprietaire) {
        // On modifie le nomUsager du proprietaire
        req.sessionUsager.nomUsager = nomUsager
      }
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
  const nomUsager = req.sessionUsager.nomUsager

  debug("Ajouter cle U2F pour usager %s", nomUsager)
  debug(req.body)

  const estProprietaire = req.sessionUsager.estProprietaire

  const {challengeId, credentials, desactiverAutres} = req.body
  const key = verifierChallengeRegistrationU2f(challengeId, credentials)

  if(key) {
    if(nomUsager) {
      debug("Challenge registration OK pour usager %s", nomUsager)
      req.comptesUsagers.ajouterCle(nomUsager, key, desactiverAutres)
      return res.sendStatus(200)
    } else if(estProprietaire) {
      debug("Challenge registration OK pour nouvelle cle proprietaire")
      req.comptesUsagers.ajouterCleProprietaire(key, desactiverAutres)
      return res.sendStatus(200)
    }

  } else {
    return res.sendStatus(403)
  }
}

function desactiverMotdepasse(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager

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
    const estProprietaire = req.sessionUsager.estProprietaire

    if(estProprietaire) {
      return res.sendStatus(403)  // Option non disponible pour le proprietaire
    }

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

function listeApplications(req, res, next) {
  const nomUsager = req.nomUsager
  const sessionUsager = req.session

  var securite = 2
  if(sessionUsager.estProprietaire) {
    securite = 4
  }

  var liste = [
    {url: '/coupdoeil', nom: 'coupdoeil', nomFormatte: "Coup D'Oeil", securite: '4.secure'},
    {url: '/posteur', nom: 'posteur', nomFormatte: "Posteur", securite: '3.protege'},
    {url: '/prive', nom: 'prive', nomFormatte: "Dev prive", securite: '2.prive'}
  ]

  // Filtrer par niveau de securite
  liste = liste.filter(item=>{
    var securiteNum = parseInt(item.securite.split('.')[0])
    return securiteNum <= securite
  })

  res.send(liste)
}

async function associerIdmg(req, res, next) {
  const nomUsager = req.sessionUsager.nomUsager
  const opts = req.body
  const {idmg} = req.body
  await req.comptesUsagers.associerIdmg(nomUsager, idmg, opts)
  res.sendStatus(200)
}

module.exports = {initialiser}
