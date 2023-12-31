const debug = require('debug')('millegrilles:route');
const express = require('express')
const bodyParser = require('body-parser')
const {randomBytes, pbkdf2} = require('crypto')
const {
  initialiser: initAuthentification,
  challengeRegistrationU2f,
  verifierChallengeRegistrationU2f,
  keylen,
  hashFunction} = require('./authentification')

var idmg = null, proprietairePresent = null;

function initialiser(middleware) {
  const route = express();

  const {extraireUsager} = middleware

  // Fonctions sous /millegrilles/api
  route.use('/api', routeApi(middleware))
  route.use('/authentification', extraireUsager, initAuthentification())
  route.get('/info.json', infoMillegrille)

  // Exposer le certificat de la MilleGrille (CA)
  route.use('/millegrille.pem', express.static(process.env.MG_MQ_CAFILE))

  ajouterStaticRoute(route)

  return route
}

function ajouterStaticRoute(route) {
  var folderStatic =
    process.env.MG_MILLEGRILLES_STATIC_RES ||
    process.env.MG_STATIC_RES ||
    'static/millegrilles'

  route.use(express.static(folderStatic))
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

    if(compteProprietaire.cles) {
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
  const sessionUsager = req.sessionUsager

  var securite = 2
  if(sessionUsager.estProprietaire) {
    securite = 4
  }

  var liste = [
    {url: '/coupdoeil', nom: 'coupdoeil', nomFormatte: "Coup D'Oeil", securite: '4.secure'},
    {url: '/prive', nom: 'prive', nomFormatte: "Dev prive", securite: '2.prive'}
  ]

  // Filtrer par niveau de securite
  liste = liste.filter(item=>{
    var securiteNum = parseInt(item.securite.split('.')[0])
    return securiteNum <= securite
  })

  res.send(liste)
}

module.exports = {initialiser}
