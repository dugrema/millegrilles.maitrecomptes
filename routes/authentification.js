// Route pour authentifier les usagers
// Toutes les fonctions de cette route sont ouvertes (aucune authentification requise)

const debug = require('debug')('millegrilles:authentification')
const debugVerif = require('debug')('millegrilles:authentification:verification')
const express = require('express')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid')
const {randomBytes, pbkdf2} = require('crypto')
const {
    parseRegisterRequest,
    generateRegistrationChallenge,
    parseLoginRequest,
    generateLoginChallenge,
    verifyAuthenticatorAssertion,
} = require('@webauthn/server');

const {MG_COOKIE} = require('../models/sessions')

// Dictionnaire de challenge pour match lors de l'authentification
// Cle : uuidv4()
// Valeur : {authRequest/registrationRequest, timestampCreation}
const challengeU2fDict = {} // Challenge. user : {challenge, date}
var intervalChallenge = null

const MG_IDMG = 'https://mg-dev4',
      MG_EXPIRATION_CHALLENGE = 20000,
      MG_FREQUENCE_NETTOYAGE = 15000

// Parametres d'obfuscation / hachage pour les mots de passe
const keylen = 64,
      hashFunction = 'sha512'

function initialiser() {
  const route = express()
  route.use(bodyParser.urlencoded({extended: true}))

  route.get('/verifier', verifierAuthentification)
  route.get('/fermer', fermer)

  route.post('/challengeProprietaire', challengeProprietaire)
  route.post('/challengeRegistrationU2f', challengeRegistrationU2f)
  route.post('/ouvrirProprietaire', ouvrirProprietaire, creerSessionUsager, rediriger)
  route.post('/ouvrir', ouvrir, creerSessionUsager, rediriger)
  route.post('/prendrePossession', prendrePossession, rediriger)
  route.post('/inscrire', inscrire, creerSessionUsager, rediriger)

  route.post('/verifierUsager', verifierUsager)

  route.get('/refuser.html', (req, res) => {
    res.status(403).send('Acces refuse');
  })

  // Creer interval entretien challenges
  intervalChallenge = setInterval(()=>{nettoyerChallenges()}, MG_FREQUENCE_NETTOYAGE)

  return route
}

function nettoyerChallenges() {
  // debug("Nettoyer challenges")
  const timestampExpire = (new Date()).getTime() - MG_EXPIRATION_CHALLENGE
  for(let challengeId in challengeU2fDict) {
    const challenge = challengeU2fDict[challengeId]
    if(challenge.timestampCreation < timestampExpire) {
      debug("Suppression challenge expire %s", challengeId)
      delete challengeU2fDict[challengeId]
    }
  }
}

function verifierAuthentification(req, res, next) {
  let verificationOk = false;
  const sessionUsager = req.sessionUsager
  if(sessionUsager) {

    // Verifier IP
    if(sessionUsager.ipClient === req.headers['x-forwarded-for']) {
      const nomUsager = sessionUsager.nomUsager
      const estProprietaire = sessionUsager.estProprietaire
      debugVerif("OK - deja authentifie : %s", nomUsager)

      if(estProprietaire) {
        res.set('Est-Proprietaire', 'true')
      }

      if(nomUsager) {
        res.set('User-Prive', nomUsager)
      }

      sessionUsager.dateAcces = new Date()
      verificationOk = true;
    }

  }

  if(verificationOk) {
    res.sendStatus(201)
  } else {
    debugVerif("WARN - Doit authentifier")
    res.sendStatus(401)
  }
}

async function challengeProprietaire(req, res, next) {

  const compteProprietaire = await req.comptesUsagers.infoCompteProprietaire()

  debug("Information cle usager")
  debug(compteProprietaire.cles)
  const authRequest = generateLoginChallenge(compteProprietaire.cles)

  const challengeId = uuidv4()  // Generer challenge id aleatoire

  // Conserver challenge pour verif
  challengeU2fDict[challengeId] = {
    authRequest,
    timestampCreation: (new Date()).getTime(),
  }

  const reponse = {
    authRequest: authRequest,
    challengeId: challengeId,
  }

  res.status(200).send(reponse)

}

async function verifierUsager(req, res, next) {
  const nomUsager = req.body['nom-usager']
  debug("Verification d'existence d'un usager : %s", nomUsager)

  // const nomUsager = req.nomUsager
  const compteUsager = await req.comptesUsagers.chargerCompte(nomUsager)

  debug("Compte usager recu")
  debug(compteUsager)

  if(compteUsager) {
    // Usager connu, session ouverte
    debug("Usager %s connu, transmission challenge login", nomUsager)

    const reponse = {}
    if(compteUsager.cles) {
      // Generer un challenge U2F
      debug("Information cle usager")
      debug(compteUsager.cles)
      const authRequest = generateLoginChallenge(compteUsager.cles)

      const challengeId = uuidv4()  // Generer challenge id aleatoire
      // Conserver challenge pour verif
      challengeU2fDict[challengeId] = {
        authRequest,
        timestampCreation: (new Date()).getTime(),
      }

      reponse.authRequest = authRequest
      reponse.challengeId = challengeId
    }

    if(compteUsager.motdepasse) {
      // Activer authentification par mot de passe
      reponse.motdepassePresent = true
    }

    res.status(200).send(reponse)
  } else {
    // Usager inconnu
    debug("Usager inconnu")
    res.sendStatus(401)
  }
}

async function ouvrirProprietaire(req, res, next) {
  debug("Authentifier proprietaire via U2F :")
  debug(req.body)

  const ipClient = req.headers['x-forwarded-for']
  let infoCompteProprietaire = await req.comptesUsagers.infoCompteProprietaire()
  req.compteProprietaire = infoCompteProprietaire

  req.ipClient = ipClient

  return authentifierU2f(req, res, next)
}

async function ouvrir(req, res, next) {
  debug("Authentifier, body :")
  debug(req.body)

  const url = req.body.url;
  debug("Page de redirection : %s", url)

  const nomUsager = req.body['nom-usager']
  const ipClient = req.headers['x-forwarded-for']
  let infoCompteUsager = await req.comptesUsagers.chargerCompte(nomUsager)

  req.nomUsager = nomUsager
  req.ipClient = ipClient

  debug("Usager : %s", nomUsager)

  // Verifier autorisation d'access
  var autorise = false
  req.compteUsager = infoCompteUsager
  debug("Info compte usager")
  debug(infoCompteUsager)

  if( ! infoCompteUsager ) {
    debug("Compte usager inconnu pour %s", nomUsager)
  } else if(infoCompteUsager.motdepasse && req.body['motdepasse-hash']) {
    return authentifierMotdepasse(req, res, next)
  } else if(req.body['u2f-challenge-id']) {
    return authentifierU2f(req, res, next)
  }

  // Par defaut refuser l'acces
  return refuserAcces(req, res, next)

}

function authentifierMotdepasse(req, res, next) {
  debug("Info compte usager")
  const infoCompteUsager = req.compteUsager.motdepasse
  debug(infoCompteUsager)
  debug(req.body)

  const motdepaseHashDb = infoCompteUsager.motdepasseHash,
        iterations = infoCompteUsager.iterations,
        salt = infoCompteUsager.salt,
        motdepasseHashRecu = req.body['motdepasse-hash'];

  pbkdf2(motdepasseHashRecu, salt, iterations, keylen, hashFunction, (err, derivedKey) => {
    if (err) return res.sendStatus(500);

    const hashPbkdf2MotdepasseRecu = derivedKey.toString('base64')
    debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseRecu, iterations, salt)

    if( motdepaseHashDb && motdepaseHashDb === hashPbkdf2MotdepasseRecu ) {
      debug("Mots de passe match, on autorise l'acces")
      // Rediriger vers URL, sinon liste applications de la Millegrille
      return next()
    } else if ( ! motdepaseHashDb ) {
      console.error("mot de passe DB inexistant")
    } else {
      debug("Mismatch mot de passe, %s != %s", motdepaseHashDb, hashPbkdf2MotdepasseRecu)
    }

    // Par defaut, acces refuse
    return refuserAcces(req, res, next)
  })
}

function authentifierU2f(req, res, next) {
  debug("Info compte usager")
  debug(req.body)

  const challengeId = req.body['u2f-challenge-id']
  const {authRequest} = challengeU2fDict[challengeId]
  delete challengeU2fDict[challengeId]
  debug(authRequest)

  const u2fResponseString = req.body['u2f-client-json']
  const authResponse = JSON.parse(u2fResponseString)
  // const result = u2f.checkSignature(authRequest, authResponse, infoCompteUsager.publicKey);

  const { challenge, keyId } = parseLoginRequest(authResponse);
  if (!challenge) {
    debug("Challenge pas recu")
    return refuserAcces(req, res, next)
    // return res.status(403).send('Challenge pas initialise');
  }

  if (authRequest.challenge !== challenge) {
    debug("Challenge mismatch")
    return refuserAcces(req, res, next)
    // return res.status(403).send('Challenge mismatch');
  }

  // Trouve la bonne cle a verifier dans la collection de toutes les cles
  var cle_match;
  let cle_id_utilisee = authResponse.rawId;

  const infoCompte = req.compteUsager || req.compteProprietaire
  let cles = infoCompte.cles;
  for(var i_cle in cles) {
    let cle = cles[i_cle];
    let credID = cle['credID'];
    credID = credID.substring(0, cle_id_utilisee.length);

    if(credID === cle_id_utilisee) {
      cle_match = cle;
      break;
    }
  }

  if(!cle_match) {
    debug("Cle inconnue: %s", cle_id_utilisee)
    return refuserAcces(req, res, next)
    // return res.status(403).send("Cle inconnue: " + cle_id_utilisee);
  }

  const autorise = verifyAuthenticatorAssertion(authResponse, cle_match);

  if(autorise) {
    // Rediriger vers URL, sinon liste applications de la Millegrille
    return next()
  } else {
    console.error("Erreur authentification")
    console.error(result)
    return refuserAcces(req, res, next)
  }
}

function refuserAcces(req, res, next) {
  return res.status(403).redirect('/millegrilles/authentification/refuser.html')
}

function fermer(req, res, next) {
  invaliderCookieAuth(res)
  res.redirect('/millegrilles#fermer');
}

function prendrePossession(req, res, next) {
  // u2f, extraire challenge correspondant
  const challengeId = req.body['u2f-challenge-id'];
  const u2fResponseString = req.body['u2f-registration-json']
  const registrationResponse = JSON.parse(u2fResponseString)

  const key = verifierChallengeRegistrationU2f(challengeId, registrationResponse)
  if( key ) {

    debug("Challenge registration OK pour prise de possession de la MilleGrille")
    req.comptesUsagers.prendrePossession({cle: key})

    next()
  } else {
    console.error("Prise de possession : mismatch challenge transmis et recus, %s !== %s", registrationRequest.challenge, challenge)
    res.sendStatus(403)
  }
}

function inscrire(req, res, next) {
  // debug("Inscrire / headers, body :")
  // debug(req.headers)
  // debug(req.body)

  const usager = req.body['nom-usager']
  const ipClient = req.headers['x-forwarded-for']

  debug("Inscrire usager %s (ip: %s)", usager, ipClient)

  req.nomUsager = usager
  req.ipClient = ipClient

  const typeAuthentification = req.body['type-authentification']

  if(typeAuthentification === 'motdepasse') {
    const motdepasseHash = req.body['motdepasse-hash']
    if( !usager || !motdepasseHash ) {
      return res.sendStatus(500)
    }
    // debug("Usager : %s, mot de passe : %s", usager, motdepasseHash)

    const salt = randomBytes(128).toString('base64'),
          iterations = Math.floor(Math.random() * 50000) + 75000

    pbkdf2(motdepasseHash, salt, iterations, keylen, hashFunction, (err, derivedKey) => {
      if (err) res.sendStatus(500);

      const hash = derivedKey.toString('base64')
      // debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hash, iterations, salt)

      // Creer usager
      const userInfo = {
        motdepasse: {
          motdepasseHash: hash,
          salt,
          iterations,
        }
      }
      req.comptesUsagers.inscrireCompte(usager, userInfo)

      // Rediriger vers URL, sinon liste applications de la Millegrille
      return next()

    });
  } else if(typeAuthentification === 'u2f') {
    // u2f, extraire challenge correspondant
    const challengeId = req.body['u2f-challenge-id'];
    const u2fResponseString = req.body['u2f-registration-json']
    const registrationResponse = JSON.parse(u2fResponseString)

    const key = verifierChallengeRegistrationU2f(challengeId, registrationResponse)
    if( key ) {

      debug("Challenge registration OK pour usager %s", usager)

      const userInfo = {
        cles: [key]
      }
      req.comptesUsagers.inscrireCompte(usager, userInfo)

      next()
    } else {
      console.error("Mismatch challenge transmis et recus, %s !== %s", registrationRequest.challenge, challenge)
      res.sendStatus(403)
    }

  } else {
    res.sendStatus(500)
  }

}

// Verification de la reponse au challenge de registration
function verifierChallengeRegistrationU2f(challengeId, registrationResponse) {
  const {registrationRequest} = challengeU2fDict[challengeId];
  delete challengeU2fDict[challengeId];

  // const result = u2f.checkRegistration(registrationRequest, registrationResponse);
  const { key, challenge } = parseRegisterRequest(registrationResponse);

  if(challenge === registrationRequest.challenge) {
    return key
  }
}

function challengeRegistrationU2f(req, res, next) {
  const id = uuidv4()
  let nomUsager;
  if(req.sessionUsager.estProprietaire) {
    nomUsager = 'proprietaire'
  } else {
    nomUsager = req.nomUsager || req.body['nom-usager']
  }

  // const registrationRequest = u2f.request(MG_IDMG);
  debug("Registration request")
  const challengeInfo = {
      relyingParty: { name: MG_IDMG },
      user: { id, name: nomUsager }
  }
  // debug(challengeInfo)
  const registrationRequest = generateRegistrationChallenge(challengeInfo);
  // debug(registrationRequest)

  challengeU2fDict[id] = {
    registrationRequest,
    timestampCreation: (new Date()).getTime(),
  }

  return res.send({
    registrationRequest,
    challengeId: id
  })
}


function rediriger(req, res) {
  const url = req.body.url;
  debug("Page de redirection : %s", url)

  if(url) {
    res.redirect(url);
  } else {
    res.redirect('/millegrilles')
  }
}

function invaliderCookieAuth(res) {
  res.cookie(MG_COOKIE, '', {
    httpOnly: true, // http only, prevents JavaScript cookie access
    secure: true,   // cookie must be sent over https / ssl
    signed: true,
    expires: new Date(),  // Expiration immediate
  });
}

function creerSessionUsager(req, res, next) {

  const nomUsager = req.nomUsager,
        ipClient = req.ipClient,
        compteProprietaire = req.compteProprietaire

  let userInfo = {
    ipClient,
    dateAcces: new Date(),
    // ipClient: req.headers['x-forwarded-for'],
  }
  if(compteProprietaire) {
    debug("Compte proprietaire")
    debug(compteProprietaire)
    userInfo.estProprietaire = true
    if(compteProprietaire.nomUsager) {
      userInfo.nomUsager = compteProprietaire.nomUsager
    }
  } else {
    userInfo.nomUsager = nomUsager
  }

  const id = uuidv4();
  req.sessionsUsagers.ouvrirSession(id, userInfo)

  // Set cookie pour la session usager
  res.cookie(MG_COOKIE, id, {
    httpOnly: true, // http only, prevents JavaScript cookie access
    secure: true,   // cookie must be sent over https / ssl
    // domain: '.maple.maceroc.com',
    signed: true,
  });

  next()
}

module.exports = {
  initialiser, challengeRegistrationU2f, verifierChallengeRegistrationU2f,
  keylen, hashFunction
}
