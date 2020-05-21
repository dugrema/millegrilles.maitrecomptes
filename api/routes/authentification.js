const debug = require('debug')('millegrilles:authentification');
const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const { v4: uuidv4 } = require('uuid');

const cacheUser = {};

function initialiser(secretCookiesPassword) {
  const route = express()
  route.use(cookieParser(secretCookiesPassword))
  route.use(bodyParser.urlencoded({extended: true}))

  route.get('/verifier', verifierAuthentification)
  route.get('/fermer', fermer)

  route.post('/ouvrir', ouvrir)
  route.post('/inscrire', inscrire)
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

  const magicNumberCookie = req.signedCookies['magic-number-cookie']
  debug("MagicNumberCookie %s", magicNumberCookie)

  const infoUsager = cacheUser[magicNumberCookie]

  // res.send('Authentification!');
  if(infoUsager) {
    debug("OK - deja authentifie")
    res.set('User-Prive', infoUsager.usager)
    infoUsager.dateAcces = new Date()
    res.sendStatus(201)
  } else {
    debug("WARN - Doit authentifier")
    res.set('X-Vouch-Failcount', '0')
    res.sendStatus(401)
  }
}

function ouvrir(req, res, next) {
  debug("Authentifier, headers :")
  debug(req.headers)

  const url = req.body.url;
  debug("Page de redirection : %s", url)

  const usager = uuidv4(); // 'monUsager';
  debug("Usager : %s", usager)

  // Verifier autorisation d'access
  var autorise = true;

  if(autorise) {
    // Creer un nouvel identificateur unique pour l'usager, avec profil
    const id = uuidv4();
    const userInfo = {
      usager,
      securite: '2.prive',
      dateAcces: new Date(),
    }
    cacheUser[id] = userInfo;

    // Set cookie pour la session usager
    res.cookie('magic-number-cookie', id, {
      httpOnly: true, // http only, prevents JavaScript cookie access
      secure: true,   // cookie must be sent over https / ssl
      // domain: '.maple.maceroc.com',
      signed: true,
    });

    // Rediriger vers URL, sinon liste applications de la Millegrille
    if(url) {
      res.redirect(url);
    } else {
      res.redirect('/millegrilles')
    }
  } else {
    // L'usager n'est pas autorise
    res.redirect('/authentification/refuser.html');
  }
}

function fermer(req, res, next) {
  res.cookie('magic-number-cookie', '', {
    httpOnly: true, // http only, prevents JavaScript cookie access
    secure: true,   // cookie must be sent over https / ssl
    signed: true,
    expires: new Date(),  // Expiration immediate
  });
  res.sendStatus(200).send("OK!");
}

function inscrire(req, res, next) {
  res.sendStatus(500);
}

function setInformation(req, res, next) {
  res.sendStatus(500);
}

module.exports = {initialiser}
