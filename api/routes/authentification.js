const debug = require('debug')('millegrilles:authentification');
const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid')
const {randomBytes, pbkdf2} = require('crypto')
const u2f = require('u2f');

const cacheUserSessions = {};
const cacheUserDb = {};
const challengeU2fDict = {}; // Challenge. user : {challenge, date}

const MG_COOKIE = 'mg-auth-cookie',
      MG_IDMG = 'https://mg-dev4.maple.maceroc.com'

// Parametres d'obfuscation / hachage pour les mots de passe
const keylen = 64,
      hashFunction = 'sha512'

function initialiser(secretCookiesPassword) {
  const route = express()
  route.use(cookieParser(secretCookiesPassword))
  route.use(bodyParser.urlencoded({extended: true}))

  route.get('/verifier', verifierAuthentification)
  route.get('/fermer', fermer)
  route.get('/getChallengeU2f', challengeU2f)

  route.post('/ouvrir', ouvrir, rediriger)
  route.post('/inscrire', inscrire, rediriger)

  route.post('/verifierUsager', verifierUsager)
  route.post('/setInformation', setInformation)

  route.get('/refuser.html', (req, res) => {
    res.status(403).send('Acces refuse');
  })

  return route
}

function verifierAuthentification(req, res, next) {
  debug("Verification authentification, headers :")
  debug(req.headers)
  debug(req.cookies)
  debug(req.signedCookies)

  const magicNumberCookie = req.signedCookies[MG_COOKIE]
  debug("MagicNumberCookie %s", magicNumberCookie)

  const infoUsager = cacheUserSessions[magicNumberCookie]

  // res.send('Authentification!');
  let verificationOk = false;
  if(infoUsager) {

    // Verifier IP
    if(infoUsager.ipClient === req.headers['x-forwarded-for']) {
      debug("OK - deja authentifie")
      debug(infoUsager)
      res.set('User-Prive', infoUsager.usager)
      // res.set('User-Protege', infoUsager.usager)
      infoUsager.dateAcces = new Date()
      verificationOk = true;
    }

  }

  if(verificationOk) {
    res.sendStatus(201)
  } else {
    debug("WARN - Doit authentifier")
    res.sendStatus(401)
  }
}

function verifierUsager(req, res, next) {
  debug("Verification d'existence d'un usager, body :")
  debug(req.body)

  const nomUsager = req.body['nom-usager']
  if(cacheUserDb[nomUsager]) {
    // Usager connu
    res.sendStatus(200)
  } else {
    // Usager inconnu
    res.sendStatus(401)
  }
}

function ouvrir(req, res, next) {
  debug("Authentifier, body :")
  debug(req.body)

  const url = req.body.url;
  debug("Page de redirection : %s", url)

  const usager = req.body['nom-usager']; // 'monUsager';
  debug("Usager : %s", usager)

  // Verifier autorisation d'access
  var autorise = false;
  const infoCompteUsager = cacheUserDb[usager]
  if(infoCompteUsager) {
    debug("Info compte usager")
    debug(infoCompteUsager)

    const motdepaseHashDb = infoCompteUsager.motdepasseHash,
          iterations = infoCompteUsager.iterations,
          salt = infoCompteUsager.salt,
          motdepasseHashRecu = req.body['motdepasse-hash'];

    pbkdf2(motdepasseHashRecu, salt, iterations, keylen, hashFunction, (err, derivedKey) => {
      if (err) res.sendStatus(500);

      const hashPbkdf2MotdepasseRecu = derivedKey.toString('base64')
      debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseRecu, iterations, salt)

      if( motdepaseHashDb && motdepaseHashDb === hashPbkdf2MotdepasseRecu ) {
        debug("Mots de passe match, on autorise l'acces")
        autorise = true
      } else if ( ! motdepaseHashDb ) {
        console.error("mot de passe DB inexistant")
      } else {
        debug("Mismatch mot de passe, %s != %s", motdepaseHashDb, motdepasseHashRecu)
      }

      if(autorise) {
        const ipClient = req.headers['x-forwarded-for']
        const id = creerSessionUsager(usager, ipClient)

        // Set cookie pour la session usager
        res.cookie(MG_COOKIE, id, {
          httpOnly: true, // http only, prevents JavaScript cookie access
          secure: true,   // cookie must be sent over https / ssl
          // domain: '.maple.maceroc.com',
          signed: true,
        });

        // Rediriger vers URL, sinon liste applications de la Millegrille
        next()
      } else {
        // L'usager n'est pas autorise
        res.status(401).redirect('/authentification/refuser.html');
      }
    })
  } else {
    // L'usager n'est pas autorise
    res.status(401).redirect('/authentification/refuser.html');
  }

}

function fermer(req, res, next) {
  invaliderCookieAuth(res)
  res.sendStatus(200).send("OK!");
}

function inscrire(req, res, next) {
  debug("Inscrire, headers :")
  debug(req.headers)

  const usager = req.body['nom-usager']

  const typeAuthentification = req.body['type-authentification']
  const motdepasseHash = req.body['motdepasse-hash']
  if( !usager || !motdepasseHash ) {
    return res.sendStatus(500)
  }
  debug("Usager : %s, mot de passe : %s", usager, motdepasseHash)

  const salt = randomBytes(128).toString('base64'),
        iterations = Math.floor(Math.random() * 50000) + 75000

  pbkdf2(motdepasseHash, salt, iterations, keylen, hashFunction, (err, derivedKey) => {
    if (err) res.sendStatus(500);

    const hash = derivedKey.toString('base64')
    debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hash, iterations, salt)

    // Creer usager
    const userInfo = {
      motdepasseHash: hash,
      usager,
      salt,
      iterations,
    }
    cacheUserDb[usager] = userInfo

    // Creer un nouvel identificateur unique pour l'usager, avec profil
    const ipClient = req.headers['x-forwarded-for']
    const id = creerSessionUsager(usager, ipClient)

    // Set cookie pour la session usager
    res.cookie(MG_COOKIE, id, {
      httpOnly: true, // http only, prevents JavaScript cookie access
      secure: true,   // cookie must be sent over https / ssl
      // domain: '.maple.maceroc.com',
      signed: true,
    });

    // Rediriger vers URL, sinon liste applications de la Millegrille
    return next()

  });

  // u2f
  // const result = u2f.checkRegistration(req.session.registrationRequest, req.body.registrationResponse);
  //
  // if (result.successful) {
  //   // Success!
  //   // Save result.publicKey and result.keyHandle to the server-side datastore, associated with
  //   // this user.
  //   return res.sendStatus(200);
  // }
  //

}

function challengeU2f(req, res, next) {
  const id = uuidv4();
  const registrationRequest = u2f.request(MG_IDMG);
  challengeU2fDict[id] = {
    registrationRequest,
    date: new Date(),
  }

  return res.send({
    registrationRequest,
    replyId: id
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

function setInformation(req, res, next) {
  res.sendStatus(500);
}

function invaliderCookieAuth(res) {
  res.cookie(MG_COOKIE, '', {
    httpOnly: true, // http only, prevents JavaScript cookie access
    secure: true,   // cookie must be sent over https / ssl
    signed: true,
    expires: new Date(),  // Expiration immediate
  });
}

function creerSessionUsager(usager, ipClient) {
  const userInfo = {
    usager,
    ipClient,
    securite: '2.prive',
    dateAcces: new Date(),
    // ipClient: req.headers['x-forwarded-for'],
  }
  const id = uuidv4();
  cacheUserSessions[id] = userInfo

  return id
}

module.exports = {initialiser}
