const debug = require('debug')('millegrilles:maitrecomptes:route');
const express = require('express')
const bodyParser = require('body-parser')
const zlib = require('zlib')
const fsPromises = require('fs/promises')

const {initialiser: initAuthentification} = require('./authentification');
const { setCacheValue, getCacheValue } = require('../models/cache');

const CACHE_FICHE_PUBLIQUE = 'fichePublique',
      CACHE_ONION_HOSTNAME = 'onionHostname'

var _hostname = null,
    _idmg = null,
    _proprietairePresent = false

function routeApi() {
  const route = express.Router()
  route.use(bodyParser.json())
  route.get('/applications.json', listeApplications)

  return route
}

async function infoMillegrille(req, res, next) {
  // Verifie si la MilleGrille est initialisee. Conserve le IDMG

  if( ! _proprietairePresent ) {
    // Faire une requete pour recuperer l'information
    const domaineAction = 'MaitreDesComptes.infoProprietaire'
    const requete = {}
    debug("Requete info proprietaire")
    const compteProprietaire = await req.amqpdao.transmettreRequete(
      domaineAction, requete, {decoder: true})

    debug("Reponse compte proprietaire")
    debug(compteProprietaire)

    if(compteProprietaire.webauthn) {
      // Conserver dans une variable globale, evite une requete sur le compte
      // du proprietaire a chaque fois pour verifier
      _proprietairePresent = true
    } else {
      _proprietairePresent = false
    }
  }

  const reponse = { idmg: _idmg, proprietairePresent: _proprietairePresent }

  res.send(reponse)
}

async function listeApplications(req, res, next) {
  const nomUsager = req.nomUsager
  const sessionUsager = req.session

  var niveauSecurite = sessionUsager.niveauSecurite || '1.public'
  debug("Demande liste applications niveau %s", niveauSecurite)

  const topologieDao = req.topologieDao
  const applications = await topologieDao.getListeApplications(niveauSecurite)
  debug("Liste applications recues: \n%O", applications)

  var liste = applications.map(app=>{
    return {
      url: app.url,
      nom: app.application,
      nomFormatte: app.application,
      securite: app.securite,
    }
  })

  res.send(liste)
}

function initialiser(hostname, amqpdao, extraireUsager, opts) {
  if(!opts) opts = {}
  _hostname = hostname
  _idmg = amqpdao.pki.idmg
  debug("IDMG: %s, AMQPDAO : %s", _idmg, amqpdao !== undefined)

  const route = express.Router()

  route.use(getFichePublique)
  route.use('/api', routeApi())
  route.use('/authentification', initAuthentification({extraireUsager}, hostname, _idmg))
  route.get('/info.json', infoMillegrille)

  // Exposer le certificat de la MilleGrille (CA)
  route.use('/millegrille.pem', express.static(process.env.MG_MQ_CAFILE))
  route.use(ajouterOnionHeader)

  ajouterStaticRoute(route)

  debug("Route /millegrilles de maitre des comptes est initialisee")
  return route
}

function ajouterOnionHeader(req, res, next) {
  if(req.onion) res.setHeader('Onion-Location', 'https://' + req.onion)
  next()
}

function ajouterStaticRoute(route) {
  // Route utilisee pour transmettre fichiers react de la messagerie en production
  var folderStatic =
    process.env.MG_STATIC_RES ||
    'static/millegrilles'

  route.get('*', cacheRes, express.static(folderStatic))
  debug("Route %s pour millegrilles initialisee", folderStatic)
}

function cacheRes(req, res, next) {

  const url = req.url
  debug("Cache res URL : %s", url)
  if(url.endsWith('.chunk.js') || url.endsWith('.chunk.css') || url.endsWith('.worker.js') ) {
       // Pour les .chunk.js, on peut faire un cache indefini (immutable)
    res.append('Cache-Control', 'public, max-age=86400, immutable')
  } else {
    // Pour les autrres, faire un cache limite (e.g. nom ne change pas)
    res.append('Cache-Control', 'public, max-age=600')
  }

  next()
}

async function getFichePublique(req, res, next) {

  let fiche = getCacheValue(CACHE_FICHE_PUBLIQUE)
  if(!fiche) {
    try {
      const ficheGzip = await fsPromises.readFile('/var/opt/millegrilles/nginx/html/fiche.json.gz')
      const ficheBytes = await new Promise((resolve, reject)=>{
        zlib.gunzip(ficheGzip, {}, (err, data)=>{
          if(err) return reject(err)
          resolve(data)
        })
      })
      fiche = JSON.parse(new TextDecoder().decode(ficheBytes))
      debug("Fiche publique : %O", fiche)
      setCacheValue(CACHE_FICHE_PUBLIQUE, fiche)
    } catch(err) {
      debug("Erreur chargement fiche.json : %O", err)
      return next()
    }
  }

  req.fiche = fiche

  let onion = getCacheValue(CACHE_ONION_HOSTNAME)
  if(!onion) {
    const adresses = fiche.adresses || []
    onion = adresses.filter(a=>a.endsWith('.onion')).pop()
    debug("Adresse onion : %O", onion)
    setCacheValue(CACHE_ONION_HOSTNAME, onion)
  }
  req.onion = onion

  next()
}

module.exports = {initialiser}
