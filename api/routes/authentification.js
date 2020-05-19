const debug = require('debug')('millegrilles:authentification');
const express = require('express')
const cookieParser = require('cookie-parser')
const { v4: uuidv4 } = require('uuid');

const cacheUser = {};

const secretCookies = uuidv4();

function initialiser() {
  const route = express();
  route.use(cookieParser(secretCookies));

  route.get('/verifier', verifierAuthentification)
  route.get('/authentifier', authentifier)
  route.get('/refuser.html', (req, res) => {
    res.send('Acces refuse');
    res.sendStatus(404);
  })

  return route
}

function verifierAuthentification(req, res, next) {
  debug("Verification authentification, headers :");
  debug(req.headers)
  debug(req.cookies)
  debug(req.signedCookies)

  const magicNumberCookie = req.signedCookies['magic-number-cookie'];
  debug("MagicNumberCookie %s", magicNumberCookie)

  const infoUsager = cacheUser[magicNumberCookie];

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

function authentifier(req, res, next) {
  debug("Authentifier, headers :")
  debug(req.headers)

  const url = req.query.url;
  debug("Page de redirection : %s", url)

  const usager = uuidv4(); // 'monUsager';
  debug("Usager : %s", usager)

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
    domain: '.maple.maceroc.com',
    signed: true,
  });
  res.redirect(url);
}

module.exports = {initialiser}
