const debug = require('debug')('millegrilles:authentification');
const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid')
const {randomBytes, pbkdf2} = require('crypto')
const u2f = require('u2f');
const {
    parseRegisterRequest,
    generateRegistrationChallenge,
    parseLoginRequest,
    generateLoginChallenge,
    verifyAuthenticatorAssertion,
} = require('@webauthn/server');

const cacheUserSessions = {};
const cacheUserDb = {};
const challengeU2fDict = {}; // Challenge. user : {challenge, date}

const MG_COOKIE = 'mg-auth-cookie',
      MG_IDMG = 'https://mg-dev4'

// Parametres d'obfuscation / hachage pour les mots de passe
const keylen = 64,
      hashFunction = 'sha512'

function initialiser(secretCookiesPassword) {
  const route = express()
  route.use(cookieParser(secretCookiesPassword))
  route.use(bodyParser.urlencoded({extended: true}))

  route.get('/verifier', verifierAuthentification)
  route.get('/fermer', fermer)

  route.post('/challengeRegistrationU2f', challengeRegistrationU2f)
  route.post('/ouvrir', ouvrir, creerSessionUsager, rediriger)
  route.post('/inscrire', inscrire, creerSessionUsager, rediriger)

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
  const infoUsager = cacheUserDb[nomUsager]
  if(infoUsager) {
    // Usager connu
    const reponse = {}
    if(infoUsager.typeAuthentification === 'u2f') {
      // Generer un challenge U2F
      debug("Information cle usager")
      debug(infoUsager.u2fKey)
      const authRequest = generateLoginChallenge(infoUsager.u2fKey)
      // const authRequest = u2f.request(MG_IDMG, infoUsager.keyHandle)

      reponse.authRequest = authRequest
      challengeU2fDict[nomUsager] = authRequest  // Conserver challenge pour verif
    }

    res.status(200).send(reponse)
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

  const nomUsager = req.body['nom-usager']; // 'monUsager';
  const ipClient = req.headers['x-forwarded-for']

  req.nomUsager = nomUsager
  req.ipClient = ipClient

  debug("Usager : %s", nomUsager)

  // Verifier autorisation d'access
  var autorise = false;
  const infoCompteUsager = cacheUserDb[nomUsager]
  if(infoCompteUsager.typeAuthentification === 'motdepasse') {
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
        debug("Mismatch mot de passe, %s != %s", motdepaseHashDb, hashPbkdf2MotdepasseRecu)
      }

      if(autorise) {
        // Rediriger vers URL, sinon liste applications de la Millegrille
        next()
      } else {
        // L'usager n'est pas autorise
        res.status(401).redirect('/authentification/refuser.html');
      }
    })
  } else if(infoCompteUsager.typeAuthentification === 'u2f') {
    debug("Info compte usager")
    debug(infoCompteUsager)

    authRequest = challengeU2fDict[nomUsager]
    debug(authRequest)

    const u2fResponseString = req.body['u2f-client-json']
    const authResponse = JSON.parse(u2fResponseString)
    // const result = u2f.checkSignature(authRequest, authResponse, infoCompteUsager.publicKey);

    const { challenge, keyId } = parseLoginRequest(authResponse);
    if (!challenge) {
      debug("Challenge pas recu")
      return res.status(403).send('Challenge pas initialise');
    }

    if (authRequest.challenge !== challenge) {
      return res.status(403).send('Challenge mismatch');
    }

    // Trouve la bonne cle a verifier dans la collection de toutes les cles
    var cle_match;
    let cle_id_utilisee = authResponse.rawId;

    let cles = [infoCompteUsager.u2fKey];
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
      return res.status(403).send("Cle inconnue: " + cle_id_utilisee);
    }

    const autorise = verifyAuthenticatorAssertion(authResponse, cle_match);

    if ( ! autorise ) {
      console.error("Erreur authentification")
      console.error(result)
    }

    if(autorise) {
      // Rediriger vers URL, sinon liste applications de la Millegrille
      return next()
    } else {
      // L'usager n'est pas autorise
      res.status(403).redirect('/authentification/refuser.html');
    }

  } else {
    // L'usager n'est pas autorise
    res.status(403).redirect('/authentification/refuser.html');
  }

}

function fermer(req, res, next) {
  invaliderCookieAuth(res)
  res.sendStatus(200).send("OK!");
}

function inscrire(req, res, next) {
  debug("Inscrire / headers, body :")
  debug(req.headers)
  debug(req.body)

  const usager = req.body['nom-usager']
  const ipClient = req.headers['x-forwarded-for']

  req.nomUsager = usager
  req.ipClient = ipClient

  const typeAuthentification = req.body['type-authentification']

  if(typeAuthentification === 'motdepasse') {
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
        usager,
        typeAuthentification,
        motdepasseHash: hash,
        salt,
        iterations,
      }
      cacheUserDb[usager] = userInfo

      // Rediriger vers URL, sinon liste applications de la Millegrille
      return next()

    });
  } else if(typeAuthentification === 'u2f') {
    // u2f, extraire challenge correspondant
    const replyId = req.body['u2f-reply-id'];
    const {registrationRequest} = challengeU2fDict[replyId];
    delete challengeU2fDict[replyId];

    debug("Registration request")
    debug(registrationRequest)

    const u2fResponseString = req.body['u2f-registration-json']
    const registrationResponse = JSON.parse(u2fResponseString)

    debug("Registration response")
    debug(registrationResponse)

    // const result = u2f.checkRegistration(registrationRequest, registrationResponse);
    const { key, challenge } = parseRegisterRequest(registrationResponse);

    debug("Verified registration response: key, challenge")
    debug(key)
    debug(challenge)

    if(challenge === registrationRequest.challenge) {
      debug("Challenge registration OK")

      const userInfo = {
        usager,
        typeAuthentification,
        u2fKey: key
      }
      cacheUserDb[usager] = userInfo

      next()
    } else {
      console.error("Mismatch challenge transmis et recus, %s !== %s", registrationRequest.challenge, challenge)
      res.sendStatus(403)
    }

    // if (result.successful) {
    //   // Success!
    //   // Save result.publicKey and result.keyHandle to the server-side datastore, associated with
    //   // this user.
    //   console.debug("U2F registration OK")
    //   console.debug(result)
    //
    //   const userInfo = {
    //     usager,
    //     typeAuthentification,
    //     publicKey: result.publicKey,
    //     keyHandle: result.keyHandle,
    //   }
    //   cacheUserDb[usager] = userInfo
    //
    //   return next()
    // } else {
    //   console.error("Erreur enregistrement U2F")
    //   console.error(result)
    //   res.sendStatus(504)
    // }

  } else {
    res.sendStatus(500)
  }

}

function challengeRegistrationU2f(req, res, next) {
  const id = uuidv4()
  const nomUsager = req.body['nom-usager']

  // const registrationRequest = u2f.request(MG_IDMG);
  debug("Registration request")
  const challengeInfo = {
      relyingParty: { name: MG_IDMG },
      user: { id: 'compte', name: nomUsager }
  }
  debug(challengeInfo)
  const registrationRequest = generateRegistrationChallenge(challengeInfo);
  debug(registrationRequest)

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

function creerSessionUsager(req, res, next) { //, usager, ipClient) {

  const usager = req.nomUsager,
        ipClient = req.ipClient

  const userInfo = {
    usager,
    ipClient,
    securite: '2.prive',
    dateAcces: new Date(),
    // ipClient: req.headers['x-forwarded-for'],
  }
  const id = uuidv4();
  cacheUserSessions[id] = userInfo

  // Set cookie pour la session usager
  res.cookie(MG_COOKIE, id, {
    httpOnly: true, // http only, prevents JavaScript cookie access
    secure: true,   // cookie must be sent over https / ssl
    // domain: '.maple.maceroc.com',
    signed: true,
  });

  next()
}

module.exports = {initialiser}
