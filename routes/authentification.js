// Route pour authentifier les usagers
// Toutes les fonctions de cette route sont ouvertes (aucune authentification requise)

const debug = require('debug')('millegrilles:maitrecomptes:authentification')
const debugVerif = require('debug')('millegrilles:maitrecomptes:verification')
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
const stringify = require('json-stable-stringify')
const cors = require('cors')
const axios = require('axios')
const https = require('https')

const {splitPEMCerts, verifierSignatureString, signerContenuString, validerCertificatFin} = require('millegrilles.common/lib/forgecommon')
const { genererCSRIntermediaire } = require('millegrilles.common/lib/cryptoForge')

// const {MG_COOKIE} = require('../models/sessions')

// Dictionnaire de challenge pour match lors de l'authentification
// Cle : uuidv4()
// Valeur : {authRequest/registrationRequest, timestampCreation}
// const challengeU2fDict = {} // Challenge. user : {challenge, date}
var intervalChallenge = null

// const MG_IDMG = 'https://mg-dev4',
//      MG_EXPIRATION_CHALLENGE = 20000,
//      MG_FREQUENCE_NETTOYAGE = 15000

// Parametres d'obfuscation / hachage pour les mots de passe
const keylen = 64,
      hashFunction = 'sha512'

function initialiser() {
  const route = express()
  const bodyParserUrlEncoded = bodyParser.urlencoded({extended: true})
  const corsFedere = configurerCorsFedere()

  route.use(bodyParserUrlEncoded)
  // const bodyParserJson = bodyParser.json()

  route.get('/verifier', verifierAuthentification)
  route.get('/fermer', fermer)

  route.post('/challengeProprietaire', challengeProprietaire)
  route.post('/challengeRegistrationU2f', challengeRegistrationU2f)
  route.post('/challengeFedere', corsFedere, challengeChaineCertificats)

  route.post('/ouvrirProprietaire', ouvrirProprietaire, creerSessionUsager, rediriger)
  route.post('/ouvrir', ouvrir, creerSessionUsager, rediriger)

  route.post('/prendrePossession', prendrePossession, rediriger)
  route.use('/preparerInscription', preparerInscription)
  route.post('/inscrire', inscrire, creerSessionUsager, rediriger)

  route.post('/verifierUsager', verifierUsager)
  route.post('/validerCompteFedere', validerCompteFedere)

  route.get('/refuser.html', (req, res) => {
    res.status(403).send('Acces refuse');
  })

  // Creer interval entretien challenges
  // intervalChallenge = setInterval(()=>{nettoyerChallenges()}, MG_FREQUENCE_NETTOYAGE)

  return route
}

// function nettoyerChallenges() {
//   // debug("Nettoyer challenges")
//   const timestampExpire = (new Date()).getTime() - MG_EXPIRATION_CHALLENGE
//   for(let challengeId in challengeU2fDict) {
//     const challenge = challengeU2fDict[challengeId]
//     if(challenge.timestampCreation < timestampExpire) {
//       debug("Suppression challenge expire %s", challengeId)
//       delete challengeU2fDict[challengeId]
//     }
//   }
// }

function verifierAuthentification(req, res, next) {
  let verificationOk = false

  const sessionUsager = req.session
  if(sessionUsager) {

    // Verifier IP
    if(sessionUsager.ipClient === req.headers['x-forwarded-for']) {
      const nomUsager = sessionUsager.nomUsager
      const estProprietaire = sessionUsager.estProprietaire
      debugVerif("OK - deja authentifie : %s", nomUsager)

      res.set('idmg', sessionUsager.idmg)

      if(estProprietaire) {
        res.set('Est-Proprietaire', 'true')
      }

      if(nomUsager) {
        res.set('User-Prive', nomUsager)
      }

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

  req.session.challengeU2f = {
    challengeId,
    authRequest,
    timestampCreation: (new Date()).getTime(),
  }

  const reponse = { authRequest, challengeId }

  res.status(200).send(reponse)

}

async function challengeChaineCertificats(req, res, next) {
  // debug("Req body")
  // debug(req.body)

  try {
    const challengeId = uuidv4()  // Generer challenge id aleatoire

    // Conserver challenge pour verif
    challengeU2fDict[challengeId] = {
      timestampCreation: new Date().getTime(),
    }

    const challengeRecu = req.body.challenge

    const pkiInstance = req.amqpdao.pki

    const reponse = {
      challengeId: challengeId,
      challengeRecu,
      chaineCertificats: splitPEMCerts(pkiInstance.chainePEM)
    }

    debug("Challenge recu pour certificats, challengId client : %s", challengeRecu)

    const signature = pkiInstance.signerContenuString(stringify(reponse))
    reponse['_signature'] = signature

    res.status(201).send(reponse)

  } catch(err) {
    console.error(err)
    debug(err)
    res.sendStatus(403)
  }
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
    } else if(req.body['certificat-present']) {
      // Pas de U2F, mais certificat present. Generer challenge id aleatoire
      const challengeId = uuidv4()
      challengeU2fDict[challengeId] = {
        timestampCreation: (new Date()).getTime(),
      }
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

  const modeFedere = req.body.federe

  if( ! infoCompteUsager ) {
    if(modeFedere) {
      debug("Inscription d'un nouveau compte federe")
      return inscrireFedere(req, res, next)
    } else {
      debug("Compte usager inconnu pour %s", nomUsager)
    }
  } else if(modeFedere) {
    return authentifierFedere(req, res, next)
  } else if(infoCompteUsager.motdepasse && req.body['motdepasse-hash']) {
    return authentifierMotdepasse(req, res, next)
  } else if(req.body['u2f-client-json']) {
    return authentifierU2f(req, res, next)
  } else if(req.body['certificat-client-json']) {
    return authentifierCertificat(req, res, next)
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

  debug("Session")
  debug(req.session)

  const challengeId = req.body['challenge-id']
  // const {authRequest} = challengeU2fDict[challengeId]
  const {authRequest} = req.session.challengeU2f
  delete req.session.challengeU2f

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

function authentifierCertificat(req, res, next) {
  debug("Info auth avec certificat")
  debug(req.body)

  const compteUsager = req.compteUsager
  debug("Compte usager")
  debug(compteUsager)

  const challengeJson = JSON.parse(req.body['certificat-client-json'])
  const challengeId = challengeJson.challengeId

  try {

    if( ! compteUsager.liste_idmg ) {
      throw new Error("Aucune idmg associe au compte usager")
    }

    // S'assurer que la reponse correspond au challengeId
    const authRequest = challengeU2fDict[challengeId]
    if(!authRequest) {
      throw new Error("challengeId inconnu")
    }

    // Verifier les certificats et la signature du message
    // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
    const chaineCertificats = challengeJson.chaineCertificats
    const { certClient, idmg } = verifierCerficatSignature(chaineCertificats, challengeJson)

    // Verifier que le idmg est dans la liste associee au compte usager
    const listeIdmgFiltree = compteUsager.liste_idmg.filter(a=>{if(a===idmg) return true})
    debug("Liste idmg filtree")
    debug(listeIdmgFiltree)
    if(listeIdmgFiltree.length === 0) {
      throw new Error("IDMG " + idmg + " n'est pas associe au compte de " + compteUsager.nomUsager)
    }

    // Autorisation correcte, supprimer le challenge
    delete challengeU2fDict[challengeId]
    req.certificat = certClient  // Conserver reference au certificat pour la session

    return next()

  } catch(err) {
    console.error(err)
    debug(err)
    res.sendStatus(403)
  }
}

function verifierCerficatSignature(chaineCertificats, messageSigne) {
  // Verifier les certificats et la signature du message
  // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
  const {cert: certClient, idmg} = validerCertificatFin(chaineCertificats, {messageSigne})

  const organizationalUnitCert = certClient.subject.getField('OU').value
  if(organizationalUnitCert !== 'navigateur') {
    throw new Error("Certificat fin n'est pas un certificat de navigateur. OU=" + organizationalUnitCert)
  }

  // S'assurer que le certificat client correspond au IDMG (O=IDMG)
  const organizationalUnit = certClient.subject.getField('OU').value

  if(organizationalUnit !== 'navigateur') {
    throw new Error("Certificat fin n'est pas un certificat de navigateur. OU=" + organizationalUnit)
  } else {
    debug("Certificat fin est de type " + organizationalUnit)
  }

  return {certClient, idmg}
}

function refuserAcces(req, res, next) {
  return res.status(403).redirect('/millegrilles/authentification/refuser.html')
}

function fermer(req, res, next) {
  invaliderCookieAuth(req)
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
  debug("Inscrire / headers, body :")
  // debug(req.headers)
  debug(req.body)

  return res.sendStatus(403)

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
  if(!req.sessionUsager) {
    // Probablement un premier login pour prise de possession (logique d'auth s'applique plus loin)
    nomUsager = 'proprietaire'
  } else if(req.sessionUsager.estProprietaire) {
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

function invaliderCookieAuth(req) {
  req.session.destroy()
}

function creerSessionUsager(req, res, next) {

  const nomUsager = req.nomUsager,
        ipClient = req.ipClient,
        compteProprietaire = req.compteProprietaire

  let userInfo = { ipClient }

  if(req.certificat) {
    userInfo.certificat = req.certificat
  }

  if(compteProprietaire) {
    debug("Compte proprietaire")
    debug(compteProprietaire)
    const idmg = req.amqpdao.pki.idmg  // Mode sans hebergemenet
    userInfo.estProprietaire = true
    if(compteProprietaire.nomUsager) {
      userInfo.nomUsager = compteProprietaire.nomUsager
    }
  } else {
    userInfo.nomUsager = nomUsager
  }

  // Copier userInfo dans session
  for(let key in userInfo) {
    req.session[key] = userInfo[key]
  }

  next()
}

function configurerCorsFedere() {
  var corsOptions = {
    origin: '*',
    methods: "POST",
  }
  const corsMiddleware = cors(corsOptions)
  return corsMiddleware
}

async function authentifierFedere(req, res, next) {
  debug("Authentifier federe")

  // debug(req.body)
  const jsonMessageStr = req.body['certificat-client-json']
  const message = JSON.parse(jsonMessageStr)

  const idmgsFournis = Object.keys(message.liste_idmg)
  if( ! idmgsFournis ||  idmgsFournis.length === 0 ) {
    console.error("Authentifier federe invalide, aucun IDMG fourni")
    return refuserAcces(req, res, next)
  }

  const compteUsager = req.compteUsager
  debug(compteUsager)

  // Le IDMG n'est pas dans la liste des identites pour ce compte, on va
  // verifier avec le serveur federe pour confirmer que ce IDMG est bien
  // associe a ce compte.
  const nomUsager = compteUsager.nomUsager
  const idmgsConnus = compteUsager.liste_idmg
  const idmgsInconnus = Object.keys(message.idmgs).filter(idmg=>{return ! idmgsConnus.includes(idmg)})

  const listeIdmgsNouveaux = {}
  for(let idmg in idmgsInconnus) {
    const chaineCertificats = message.idmgs[idmg]

    try {
      const { certClient, idmg: idmgIssuer } = verifierCerficatSignature(chaineCertificats, message)
      listeIdmgs[idmgIssuer] = chaineCertificats
      debug("Chaine certificat ok, idmg issuer %s", idmgIssuer)
    } catch(err) {
      console.error("Erreur validation certificat IDMG " + idmg)
      return refuserAcces(req, res, next)
    }
  }

  var verifServeurOrigine = false
  if(Object.keys(listeIdmgsNouveaux).length > 0) {
    // Verifier si les IDMG sont associes a ce compte federe aupres du serveur
    // d'origine.
    verifServeurOrigine = appelVerificationCompteFedere(nomUsager, Object.keys(listeIdmgsNouveaux))
    if(verifServeurOrigine) {
      debug("Compte usager confirme OK : %s", nomUsager)

      for(let idmg in listeIdmgsNouveaux) {
        const chaineCertificats = listeIdmgsNouveaux[idmg]
        const opts = {chaineCertificats: chaineCertificats}
        await req.comptesUsagers.associerIdmg(nomUsager, idmg, opts)
      }
    } else {
      console.error("Erreur verification compte " + nomUsager + ", IDMG " + idmg + " aupres du serveur d'origine")
      return refuserAcces(req, res, next)
    }
  }

  if(verifServeurOrigine) {
    // Le serveur d'origine a deja confirme le compte, valide.
    return next()
  }

  for(let idx in compteUsager.liste_idmg) {
    const idmgCompte = compteUsager.liste_idmg[idx]

    const chaineCertificats = message.idmgs[idmgCompte]
    if(chaineCertificats) {
      const { certClient, idmg: idmgIssuer } = verifierCerficatSignature(chaineCertificats, message)
      debug("Chaine certificat ok, idmg issuer %s", idmgIssuer)
      idmgConfirme = idmgConfirme

      // Ok, l'usager est authentifie
      req.idmg = idmgIssuer
      req.cert = certClient

      return next()
    }
  }

  return refuserAcces(req, res, next)
}

async function inscrireFedere(req, res, next) {

  if( ! message.idmgs ||  message.idmgs.length === 0 ) {
    console.error("Inscrire federe invalide, aucun IDMG fourni")
    return refuserAcces(req, res, next)
  }

  // Verifier chaine de certificats, signature, challenge
  const ipClient = req.headers['x-forwarded-for']
  req.ipClient = ipClient

  const jsonMessageStr = req.body['certificat-client-json']
  const message = JSON.parse(jsonMessageStr)
  const listeIdmgs = {}
  for(let idmg in message.idmgs) {
    const chaineCertificats = message.idmgs[idmg]
    const { certClient, idmg: idmgIssuer } = verifierCerficatSignature(chaineCertificats, message)
    listeIdmgs[idmgIssuer] = chaineCertificats
    debug("Chaine certificat ok, idmg issuer %s", idmgIssuer)
  }

  // Extraire nom d'usager
  const nomUsager = req.body['nom-usager']
  const verifServeurOrigine = appelVerificationCompteFedere(nomUsager, Object.keys(listeIdmgs))
  if(verifServeurOrigine) {
    console.debug("Compte usager confirme OK par server %s", usagerSplit[1])
  } else {
    return refuserAcces(req, res, next)
  }

  // Si echec du challenge, voir si usager@local.com est disponible et retourner
  // echec en reponse avec options.
  debug("Inscrire usager %s (ip: %s)", nomUsager, ipClient)

  req.nomUsager = nomUsager
  req.idmgs = Object.keys(listeIdmgs)  // Liste idmgs valides pour cette connexion

  // Creer usager
  const userInfo = {
    'certificats': listeIdmgs
  }
  req.comptesUsagers.inscrireCompte(nomUsager, userInfo)

  next()  // OK, compte cree

  // return refuserAcces(req, res, next)

  // Rediriger vers URL, sinon liste applications de la Millegrille
  // return next()
}

function validerCompteFedere(req, res, next) {
  debug('validerCompteFedere')
  debug(req.body)
  res.sendStatus(200)
}

async function appelVerificationCompteFedere(nomUsager, listeIdmgs) {
  const usagerSplit = nomUsager.split('@')
  const urlVerifUsager = 'https://' + usagerSplit[1] + '/millegrilles/authentification/validerCompteFedere'
  const paramVerif = 'nom-usager=' + usagerSplit[0] + '&idmgs=' + listeIdmgs.join(',')

  const options = {
    url: urlVerifUsager,
    method: 'post',
    data: paramVerif
  }

  if(process.env.NODE_ENV === 'dev') {
    // Pour environnement de dev, ne pas verifier la chaine de certs du serveur
    options.httpsAgent = new https.Agent({
      rejectUnauthorized: false
    })
  }

  try {
    const confirmationServeurCompte = await axios(options)
    if(confirmationServeurCompte.status === 200) {
      console.debug("Compte usager confirme OK par server %s", usagerSplit[1])
      return true
    }
  } catch(err) {
    console.error("Erreur verification compte sur serveur origine " + nomUsager)
    debug(err)
  }

  return false
}

// Prepare l'inscription d'un nouveau compte.
function preparerInscription(req, res, next) {

  // Generer une nouvelle keypair et CSR
  const {clePrivee, csrPem} = genererCSRIntermediaire()

  // Conserver la cle privee dans la session usager
  req.session.clePriveeCompte = clePrivee

  // Si U2F selectionne, on genere aussi un challenge

  // Si Google Authenticator est selectionne, on genere aussi un challenge

  // Retourner le CSR du certificat infermediaire
  return res.send({csrPem})

}

module.exports = {
  initialiser, challengeRegistrationU2f, verifierChallengeRegistrationU2f,
  keylen, hashFunction
}
