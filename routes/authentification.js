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
const authenticator = require('authenticator')

const {
    splitPEMCerts, verifierChallengeCertificat, signerContenuString,
    calculerIdmg, chargerClePrivee, chiffrerPrivateKey,
    matchCertificatKey, calculerHachageCertificatPEM, chargerCertificatPEM,
    validerChaineCertificats,
  } = require('millegrilles.common/lib/forgecommon')
const { genererCSRIntermediaire, genererCertificatNavigateur, genererKeyPair } = require('millegrilles.common/lib/cryptoForge')
const validateurAuthentification = require('../models/validerAuthentification')

const CONST_U2F_AUTH_CHALLENGE = 'u2fAuthChallenge',
      CONST_U2F_REGISTRATION_CHALLENGE = 'u2fRegistrationChallenge',
      CONST_CERTIFICAT_AUTH_CHALLENGE = 'certAuthChallenge'
      CONST_AUTH_PRIMAIRE = 'authentificationPrimaire',
      CONST_URL_ERREUR_MOTDEPASSE = '/millegrilles?erreurMotdepasse=true'

// Parametres d'obfuscation / hachage pour les mots de passe
const PBKDF2_KEYLEN = 64,
      PBKDF2_HASHFUNCTION = 'sha512'

function initialiser(middleware, opts) {
  const route = express()
  // const corsFedere = configurerCorsFedere()
  const bodyParserJson = bodyParser.json()
  const bodyParserUrlEncoded = bodyParser.urlencoded({extended: true})

  // Routes sans body
  route.get('/verifier', verifierAuthentification)
  route.get('/fermer', fermer)

  route.post('/challengeProprietaire', challengeProprietaire)
  // route.post('/challengeFedere', corsFedere, challengeChaineCertificats)

  // Parsing JSON
  route.post('/inscrire', bodyParserJson, inscrire)
  route.post('/preparerInscription', bodyParserJson, preparerInscription)
  route.post('/preparerCertificatNavigateur',
    bodyParserJson, identifierUsager, middleware.extraireUsager,
    preparerCertificatNavigateur)

  route.post('/challengeRegistrationU2f', challengeRegistrationU2f)
  route.post('/prendrePossession', bodyParserUrlEncoded, prendrePossession, rediriger)

  route.post('/ouvrir',
    bodyParserJson,
    identifierUsager,                   // req.nomUsager
    middleware.extraireUsager,          // req.compteUsager
    verifierChaineCertificatNavigateur, // Verification fullchain, req.certificat, req.idmgCompte, req.idmgsActifs
    authentifierCertificat,             // Authentification via signature challenge certificat
    // verifierIdmgs,
    ouvrir,                             // Decide si auth est valide
    creerSessionUsager,                 // Auth est valide, ajout params dans req.session
    rediriger                           // Page accueil ou page demandee
  )

  route.post('/verifierUsager', bodyParserJson, verifierUsager)

  // Toutes les routes suivantes assument que l'usager est deja identifie
  route.use(middleware.extraireUsager)

  route.post('/ouvrirProprietaire', bodyParserJson, ouvrirProprietaire, creerSessionUsager, rediriger)

  // Acces refuse
  route.get('/refuser.html', (req, res) => {
    res.redirect(CONST_URL_ERREUR_MOTDEPASSE);
  })

  return route
}

function identifierUsager(req, res, next) {
  const nomUsager = req.body.nomUsager
  if(nomUsager) {
    req.nomUsager = nomUsager
  }
  next()
}

function verifierAuthentification(req, res, next) {
  let verificationOk = false

  const sessionUsager = req.session
  if(sessionUsager) {

    // Verifier IP
    if(sessionUsager.authentificationPrimaire && sessionUsager.ipClient === req.headers['x-forwarded-for']) {
      const nomUsager = sessionUsager.nomUsager
      const estProprietaire = sessionUsager.estProprietaire
      debugVerif("OK - deja authentifie : %s", nomUsager)

      if(sessionUsager.idmgCompte) {
        res.set('Idmg-Compte', sessionUsager.idmgCompte)
      }

      if(sessionUsager.idmgsActifs) {
        res.set('Idmgs-Actifs', sessionUsager.idmgsActifs.join(','))
      }

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
    // debugVerif("WARN - Doit authentifier")
    debugVerif("Usager non authentifie, url : %s", req.url)
    // debugVerif(req.headers)
    // debugVerif(req.session)

    res.sendStatus(401)
  }
}

async function challengeProprietaire(req, res, next) {

  const compteProprietaire = await req.comptesUsagers.infoCompteProprietaire()

  debug("Information cle proprietaire")
  debug(compteProprietaire)
  const authRequest = generateLoginChallenge(compteProprietaire.u2f)

  const challengeId = uuidv4()  // Generer challenge id aleatoire

  req.session[CONST_U2F_AUTH_CHALLENGE] = authRequest

  debug("Session courante :\n%O", req.session)

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
    res.redirect(CONST_URL_ERREUR_MOTDEPASSE)
  }
}

async function verifierUsager(req, res, next) {
  const nomUsager = req.body.nomUsager
  debug("Verification d'existence d'un usager : %s\nBody: %O", nomUsager, req.body)

  if( ! nomUsager ) {
    console.error("verifierUsager: Requete sans nom d'usager")
    return res.sendStatus(400)
  }

  // const nomUsager = req.nomUsager
  const compteUsager = await req.comptesUsagers.chargerCompte(nomUsager)

  debug("Compte usager recu")
  debug(compteUsager)

  if(compteUsager) {
    // Usager connu, session ouverte
    debug("Usager %s connu, transmission challenge login", nomUsager)

    const reponse = {}

    // Generer challenge pour le certificat de navigateur ou de millegrille
    //if(req.body.certificatNavigateur) {
      reponse.challengeCertificat = {
        date: new Date().getTime(),
        data: Buffer.from(randomBytes(32)).toString('base64'),
      }
      req.session[CONST_CERTIFICAT_AUTH_CHALLENGE] = reponse.challengeCertificat
    //}

    if(compteUsager.u2f) {
      // Generer un challenge U2F
      debug("Information cle usager")
      debug(compteUsager.u2f)
      const challengeU2f = generateLoginChallenge(compteUsager.u2f)

      // Conserver challenge pour verif
      req.session[CONST_U2F_AUTH_CHALLENGE] = challengeU2f

      reponse.challengeU2f = challengeU2f
    }

    if(compteUsager.motdepasse) {
      reponse.motdepasseDisponible = true
    }

    if(compteUsager.totp) {
      reponse.totpDisponible = true
    }

    if(req.session[CONST_AUTH_PRIMAIRE]) {
      reponse[CONST_AUTH_PRIMAIRE] = req.session[CONST_AUTH_PRIMAIRE]
    }

    res.send(reponse)
  } else {
    // Usager inconnu
    debug("Usager inconnu")
    res.sendStatus(401)
  }
}

async function ouvrirProprietaire(req, res, next) {
  debug("Authentifier proprietaire via U2F :\n%O", req.body)
  debug("Session courante :\n%O", req.session)

  const ipClient = req.headers['x-forwarded-for']
  let infoCompteProprietaire = await req.comptesUsagers.infoCompteProprietaire()
  req.compteUsager = infoCompteProprietaire

  req.ipClient = ipClient

  return authentifierU2f(req, res, next)
}

async function ouvrir(req, res, next) {
  debug("ouvrir: Authentifier, body : %O", req.body)

  const nomUsager = req.body.nomUsager
  const ipClient = req.headers['x-forwarded-for']
  const fullchainPem = req.body['certificat-fullchain-pem']

  // Valider la chaine de certificat fournie par le client
  let infoCompteUsager = await req.comptesUsagers.chargerCompte(nomUsager)

  req.nomUsager = nomUsager
  req.ipClient = ipClient

  debug("Usager : %s", nomUsager)

  // Verifier autorisation d'access
  var autorise = false
  req.compteUsager = infoCompteUsager
  debug("Info compte usager")
  debug(infoCompteUsager)

  // const modeFedere = req.body.federe

  if( ! infoCompteUsager ) {
    // if(modeFedere) {
    //   debug("Inscription d'un nouveau compte federe")
    //   return inscrireFedere(req, res, next)
    // } else {
      debug("Compte usager inconnu pour %s", nomUsager)
    // }
    // } else if(modeFedere) {
    //   return authentifierFedere(req, res, next)
  } else if(req.body.motdepasseHash) {
    return authentifierMotdepasse(req, res, next)
  } else if(req.body.u2fAuthResponse) {
    return authentifierU2f(req, res, next)
  } else if(req.body.tokenTotp) {
    return authentifierTotp(req, res, next)
  } else if(req.body.challengeCleMillegrille) {
    return authentifierCleMillegrille(req, res, next)
  } else if(req.session[CONST_AUTH_PRIMAIRE]) {
    debug("Authentification acceptee par defaut avec methode %s", req.session[CONST_AUTH_PRIMAIRE])
    return next()
  }

  // Par defaut refuser l'acces
  return refuserAcces(req, res, next)

}

async function authentifierMotdepasse(req, res, next) {

  try {
    // debug("Info compte usager")
    const infoCompteUsager = req.compteUsager
    debug("authentifierMotdepasse: infoCompteUsager : %O", infoCompteUsager)

    const motdepasseHashRecu = req.body.motdepasseHash

    if(infoCompteUsager['_mg-libelle'] === 'proprietaire' || infoCompteUsager.nomUsager === 'proprietaire') {
      debug("Validation mot de passe proprietaire")

      const motDePasseCourantMatch = await validateurAuthentification.verifierMotdepasse(
        infoCompteUsager, motdepasseHashRecu)

      // const {motdepasseHash: motdepasseActuelHash, salt, iterations} = infoCompteUsager.motdepasse
      //
      // // Verifier le mot de passe en mode pbkdf2
      // var motDePasseCourantMatch = await new Promise((resolve, reject) => {
      //   pbkdf2(motdepasseHashRecu, salt, iterations, PBKDF2_KEYLEN, PBKDF2_HASHFUNCTION,
      //     (err, derivedKey) => {
      //       if (err) return reject(err)
      //
      //       const hashPbkdf2MotdepasseActuel = derivedKey.toString('base64')
      //       debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseActuel, iterations, salt)
      //
      //       return resolve(hashPbkdf2MotdepasseActuel === motdepasseActuelHash)
      //     }
      //   )
      // })

      if(motDePasseCourantMatch) {
        // Autorise OK
        req.session[CONST_AUTH_PRIMAIRE] = 'motdepasse'

        return next()
      } else {
        // Mauvais mot de passe
        debug("Mauvais mot de passe")
        return res.sendStatus(401)
      }

    } else {
      const certificatNavigateurHachages = req.body['cert-navigateur-hash'],
            idmgCompte = req.idmgCompte
            // idmgCompte = infoCompteUsager.idmgCompte

      if( infoCompteUsager.idmgs && infoCompteUsager.idmgs[idmgCompte] ) {
        const infoCompteIdmg = infoCompteUsager.idmgs[idmgCompte]
        const clePriveeCompteChiffree = infoCompteIdmg.cleChiffreeCompte

        if( infoCompteIdmg && clePriveeCompteChiffree ) {
          // Verifier que le mot de passe est correct - on tente de dechiffrer la cle de compte
          if( chargerClePrivee(clePriveeCompteChiffree, {password: motdepasseHashRecu}) ) {
            debug("Cle privee du compte dechiffree OK, mot de passe verifie")

            // Set methode d'autenficiation primaire utilisee pour creer session
            req.session[CONST_AUTH_PRIMAIRE] = 'motdepasse'

            return next()  // Authentification primaire reussie

          } else {
            debug("Mot de passe incorrect pour %s", nomUsager)
            return res.sendStatus(401)
          }

        } else {
          debug("infoCompteIdmg ou clePriveeCompteChiffree manquant pour compte %s", nomUsager)
          return res.sendStatus(403)
        }
      } else {
        debug("Information manquante : motdepasseHashRecu %s, idmgCompte %s", motdepasseHashRecu, idmgCompte)
        return res.sendStatus(403)
      }
    }

  } catch(err) {
    debug("Erreur traitement compte")
    console.error(err)
    res.sendStatus(500)
  }

  // Par defaut, echec d'authentification
  return res.redirect(CONST_URL_ERREUR_MOTDEPASSE)
}

async function authentifierU2f(req, res, next) {

  debug("Authentifier U2F\nSession: %O\nBody: %O", req.session, req.body)

  const sessionAuthChallenge = req.session[CONST_U2F_AUTH_CHALLENGE],
        infoCompteUsager = req.compteUsager

  delete req.session[CONST_U2F_AUTH_CHALLENGE]

  debug(sessionAuthChallenge)

  const authResponse = req.body.u2fAuthResponse

  const autorise = await validateurAuthentification.verifierU2f(
    infoCompteUsager, sessionAuthChallenge, authResponse)

  if(autorise) {

    // Set methode d'autenficiation primaire utilisee pour creer session
    req.session[CONST_AUTH_PRIMAIRE] = 'u2f'

    // Conserver information des idmgs dans la session
    for(let cle in req.idmgsInfo) {
      req.session[cle] = req.idmgsInfo[cle]
    }

    // Rediriger vers URL, sinon liste applications de la Millegrille
    return next()
  } else {
    console.error("Erreur authentification")
    return refuserAcces(req, res, next)
  }
}

async function authentifierTotp(req, res, next) {
  // Recuperer cle dechiffrage du secret TOTP
  try {
    const comptesUsagersDao = req.comptesUsagers
    const compteUsager = req.compteUsager
    debug("authentifierTotp: infoCompteUsager : %O", compteUsager)

    if(compteUsager['_mg-libelle'] === 'proprietaire' || compteUsager.nomUsager === 'proprietaire') {
      // debug("Requete secret TOTP pour proprietaire")
      // const secretTotp = await comptesUsagerDao.requeteCleProprietaireTotp(infoUsagerTotp)
      // debug("Recu secret TOTP pour proprietaire : %O", secretTotp)
      // const cleTotp = secretTotp.totp
      //
      // const valide = authenticator.verifyToken(cleTotp, req.body.tokenTotp)

      const valide = await validateurAuthentification.verifierTotp(
        compteUsager, comptesUsagersDao, req.body.tokenTotp)

      if(valide) {
        req.session[CONST_AUTH_PRIMAIRE] = 'totp'
        return next()
      } else {
        debug("Token TOTP invalide")
      }
    }

  } catch(err) {
    console.error("Erreur demande code secret TOTP : %O", err)
  }

  // Par defaut, acces refuse
  return refuserAcces(req, res, next)
}

function authentifierCleMillegrille(req, res, next) {
  // Authentification en utilisant la cle de millegrille
  const challengeBody = req.body.challengeCleMillegrille,
        challengeSession = req.session[CONST_CERTIFICAT_AUTH_CHALLENGE],
        amqpdao = req.amqpdao

  debug("authentifierCleMillegrille :\nBody: %O\nSession: %O", challengeBody, challengeSession)

  const certMillegrille = amqpdao.pki.caForge

  if(challengeBody && challengeSession) {
    debug("authentifierCleMillegrille : verifier signature et comparer info avec session")
    const valide = validateurAuthentification.verifierSignatureMillegrille(
      certMillegrille, challengeSession, challengeBody)
    debug("Information validite : %O", valide)

    if(valide) {
      req.session[CONST_AUTH_PRIMAIRE] = 'clemillegrille'  // Indique succes auth
      req.session.estProprietaire = true  // Forcer access proprietaire
      return next()
    } else {
      console.error("Signature certificat invalide")
    }
  }

  // Par defaut, acces refuse
  return refuserAcces(req, res, next)
}

function verifierIdmgs(req, res, next) {
  // Verifier tous les certificats pour ce navigateur, conserver liste actifs
  var userInfo = null
  const navigateursHachage = req.body['cert-navigateur-hash']
  const motdepassePartielNavigateur = req.body['motdepasse-partiel']
  if( navigateursHachage && req.compteUsager ) {
    const listeNavigateurs = navigateursHachage.split(',')
    const infoEtatIdmg = lireEtatIdmgNavigateur(listeNavigateurs, motdepassePartielNavigateur, req.compteUsager.idmgs)
    userInfo = {
      ...infoEtatIdmg,
      idmgCompte: req.compteUsager.idmgCompte
    }
  } else {
    debug("Pas de hachage/idmgs fournis")
    debug(navigateursHachage)
    debug(req.compteUsager)
  }

  req.idmgsInfo = userInfo

  next()
}

function verifierChaineCertificatNavigateur(req, res, next) {
  debug("verifierChaineCertificatNavigateur : %O", req.body)

  // Verifier que la chaine de certificat est valide
  const compteUsager = req.compteUsager

  if( req.body.certificatFullchainPem ) {
    const chainePem = splitPEMCerts(req.body.certificatFullchainPem)

    // Verifier les certificats et la signature du message
    // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
    const { cert: certNavigateur, idmg } = validerChaineCertificats(chainePem)

    const commonName = certNavigateur.subject.getField('CN').value
    if(req.nomUsager !== commonName) {
      throw new Error("Le certificat ne correspond pas a l'usager : CN=" + commonName)
    }

    // S'assurer que le certificat client correspond au IDMG (O=IDMG)
    const organizationalUnit = certNavigateur.subject.getField('OU').value

    if(organizationalUnit !== 'Navigateur') {
      throw new Error("Certificat fin n'est pas un certificat de Navigateur. OU=" + organizationalUnit)
    } else {
      debug("Certificat fin est de type " + organizationalUnit)
    }

    debug("Cert navigateur, idmg %s :\n%O", idmg, certNavigateur)

    req.idmgActifs = [idmg]
    req.idmgCompte = idmg
    req.certificat = certNavigateur  // Conserver reference au certificat pour la session
  } else {
    debug("Certificat navigateur absent")
  }

  next()
}

function authentifierCertificat(req, res, next) {
  debug("Info auth avec certificat")
  debug(req.body)

  const compteUsager = req.compteUsager
  debug("Compte usager")
  debug(compteUsager)

  try {
    if( req.body.reponseCertificat && req.certificat ) {
      const challengeBody = req.body.reponseCertificat,
            challengeSession = req.session[CONST_CERTIFICAT_AUTH_CHALLENGE],
            idmgSysteme = req.amqpdao.pki.idmg,
            chainePem = splitPEMCerts(req.body.certificatFullchainPem)

      if(challengeBody && challengeSession) {
        const {valide} = validateurAuthentification.verifierSignatureCertificat(
          idmgSysteme, compteUsager, chainePem, challengeSession, challengeBody)

        if(valide) {
          debug("Verification certificat OK")
          req.session[CONST_AUTH_PRIMAIRE] = 'certificat'  // Indique succes auth
          return next()
        } else {
          console.error("Signature certificat invalide")
        }

        // if( challengeBody.date !== challengeSession.date ) {
        //   console.error("Challenge certificat mismatch date")
        // } else if( challengeBody.data !== challengeSession.data ) {
        //   console.error("Challenge certificat mismatch data")
        // } else {
        //
        //   debug("Verification authentification par certificat, signature :\n%s", challengeBody['_signature'])
        //
        //   // Verifier les certificats et la signature du message
        //   // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
        //   debug("authentifierCertificat, cert :\n%O\nchallengeJson\n%O", req.certificat, challengeBody)
        //   if(verifierChallengeCertificat(req.certificat, challengeBody)) {
        //     req.session[CONST_AUTH_PRIMAIRE] = 'certificat'  // Indique succes auth
        //     return next()
        //   } else {
        //     console.error("Signature certificat invalide")
        //   }
        //
        // }

      } else {
        // Aucun challenge signe pour le certificat, on n'ajoute pas de methode d'authentification
        // primaire sur req (une autre methode doit etre fournie comme mot de passe, U2F, etc.)
      }
    } else {
      debug("Skip authentification par navigateur")
    }
  } catch(err) {
    console.error(err)
    debug(err)
    return res.sendStatus(401)
  } finally {
    // Nettoyage session
    // delete req.session[CONST_CERTIFICAT_AUTH_CHALLENGE]
  }

  // Meme si le test echoue, on continue pour voir si une autre methode fonctionne
  next()
}

function verifierCerficatSignature(chaineCertificats, messageSigne) {
  // Verifier les certificats et la signature du message
  // Une erreur est lancee si la signature est invalide
  validerCertificatFin(chaineCertificats, {messageSigne})
}

function refuserAcces(req, res, next) {
  return res.sendStatus(401)
}

function fermer(req, res, next) {
  invaliderCookieAuth(req)
  res.redirect('/millegrilles#fermer');
}

function prendrePossession(req, res, next) {
  // u2f, extraire challenge correspondant
  const challengeId = req.body['u2f-challenge-id'];

  const cle = verifierChallengeRegistrationU2f(req)
  if( cle ) {

    debug("Challenge registration OK pour prise de possession de la MilleGrille")
    req.comptesUsagers.prendrePossession({cle})

    next()
  } else {
    console.error("Prise de possession : mismatch challenge transmis et recus, %s !== %s", registrationResponse.challenge, challenge)
    res.sendStatus(403)
  }
}

async function inscrire(req, res, next) {
  debug("Inscrire / headers, body :")
  // debug(req.headers)
  debug(req.body)
  debug("Session")
  debug(req.session)

  const ipClient = req.headers['x-forwarded-for']

  // Extraire contenu du body
  const {
    usager,
    certMillegrillePEM,
    certIntermediairePEM,
    motdepasseHash,
    csrNavigateur,
  } = req.body

  // const usager = req.body['nom-usager']
  // const certMillegrillePEM = req.body['cert-millegrille-pem']
  // const certIntermediairePEM = req.body['cert-intermediaire-pem']
  // const motdepassePartielClient = req.body['motdepasse-partiel']
  // const motdepasseHash = req.body['motdepasse-hash']

  const certificatCompte = chargerCertificatPEM(certIntermediairePEM)

  const idmg = calculerIdmg(certMillegrillePEM)

  debug("Inscrire usager %s (ip: %s)", usager, ipClient)

  req.nomUsager = usager
  req.ipClient = ipClient

  if( !usager || !motdepasseHash ) {
    return res.sendStatus(500)
  }
  debug("Usager : %s, mot de passe : %s", usager, motdepasseHash)

  debug("IDMG : %s, certificat millegrille", idmg)
  debug(certMillegrillePEM)
  debug("Intermediaire (compte)")
  debug(certIntermediairePEM)
  debug("Preparer certificat navigateur")

  // Verifier que la cle privee dans la session correspond au certificat intermediaire recu
  const clePriveeComptePem = req.session.clePriveeComptePem
  if( ! matchCertificatKey(certIntermediairePEM, clePriveeComptePem) ) {
    throw new Error("Certificat intermediaire recu du navigateur ne correspond pas a la cle generee en memoire")
  }

  // Chiffrer cle privee conservee dans la session
  const clePriveeCompte = chargerClePrivee(clePriveeComptePem)
  const clePriveeCompteChiffreePem = chiffrerPrivateKey(clePriveeCompte, motdepasseHash)
  debug(clePriveeCompteChiffreePem)

/*
  const {cert: certNavigateur, pem: certNavigateurPem} = await genererCertificatNavigateur(
    idmgCompte, req.nomUsager, csrNavigateurPem, certIntermediairePEM, clePriveeCompte)

  const fullchainList = [
    certNavigateurPem,
    infoCompteIdmg.certificatComptePem,
    infoCompteIdmg.certificatMillegrillePem,
  ]
  const fullchainPem = fullchainList.join('\n')

  // Creer usager
  const userInfo = {
    idmg: idmgCompte,
    certificat: certNavigateurPem,
    fullchain: fullchainPem,
    expiration: Math.ceil(certNavigateur.validity.notAfter.getTime() / 1000)
  }
  const {clePrivee: clePriveeNavigateur, clePublique: clePubliqueNavigateur, clePubliquePEM: clePubliqueNavigateurPEM} = genererKeyPair()
*/
  const {cert: certNavigateur, pem: certNavigateurPem} = await genererCertificatNavigateur(
    idmg, usager, csrNavigateur, certIntermediairePEM, clePriveeCompte)

  const fullchainList = [
    certNavigateurPem,
    certIntermediairePEM,
    certMillegrillePEM,
  ]
  debug("Navigateur fullchain :\n%O", fullchainList)
  const fullchainPem = fullchainList.join('\n')
  debug(certNavigateurPem)

  // Creer usager
  const userInfo = {
    idmgCompte: idmg,
    idmgs: {
      [idmg]: {
        expiration: Math.ceil(certificatCompte.validity.notAfter.getTime() / 1000),
        cleChiffreeCompte: clePriveeCompteChiffreePem,
        certificatMillegrillePem: certMillegrillePEM,
        certificatComptePem: certIntermediairePEM,
      }
    }
  }

  if( req.body.u2fRegistrationJson && req.session[CONST_U2F_REGISTRATION_CHALLENGE] ) {
    debug("Verification cle U2F")
    const { key, challenge } = parseRegisterRequest(req.body.u2fRegistrationJson);
    if( challenge === req.session[CONST_U2F_REGISTRATION_CHALLENGE] ) {
      debug("Activation cle U2F")
      userInfo.u2f = [key]
    } else {
      debug("Mismatch challenge U2F")
    }
  }

  debug("User info pour inscription du compte")
  debug(userInfo)
  debug(userInfo.idmgs[idmg])

  await req.comptesUsagers.inscrireCompte(usager, userInfo)

  return res.status(201).send({
    idmg,
    certificat: certNavigateurPem,
    fullchain: fullchainPem,
    expiration: Math.ceil(certNavigateur.validity.notAfter.getTime() / 1000),
  })

}

// Verification de la reponse au challenge de registration
function verifierChallengeRegistrationU2f(req) {
  const u2fResponseString = req.body['u2f-registration-json']
  const registrationResponse = JSON.parse(u2fResponseString)

  const sessionChallenge = req.session[CONST_U2F_AUTH_CHALLENGE]

  // const result = u2f.checkRegistration(registrationRequest, registrationResponse);
  const { key, challenge } = parseRegisterRequest(registrationResponse);

  if(challenge === sessionChallenge.challenge) {
    delete req.session[CONST_U2F_AUTH_CHALLENGE]
    return key
  }
}

function challengeRegistrationU2f(req, res, next) {
  let nomUsager;
  if(!req.session.nomUsager) {
    // Probablement un premier login pour prise de possession (logique d'auth s'applique plus loin)
    nomUsager = 'proprietaire'
  } else if(req.session.estProprietaire) {
    // nomUsager = 'proprietaire'
    console.error("Session deja identifiee comme proprietaire")
    return res.sendStatus(403)
  } else {
    nomUsager = req.session.nomUsager || req.nomUsager || req.body.nomUsager
  }

  // const registrationRequest = u2f.request(MG_IDMG);
  debug("Registration request, usager %s", nomUsager)
  const challengeInfo = {
      relyingParty: { name: req.hostname },
      user: { id: nomUsager, name: nomUsager }
  }
  // debug(challengeInfo)
  const registrationRequest = generateRegistrationChallenge(challengeInfo);
  // debug(registrationRequest)

  req.session[CONST_U2F_AUTH_CHALLENGE] = registrationRequest

  return res.send({
    registrationRequest,
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
        compteUsager = req.compteUsager

  debug("Creer session usager pour %s\n%O", nomUsager, compteUsager)

  let userInfo = {
    ipClient,
  }

  if(compteUsager['nomUsager'] === 'proprietaire') {
    debug("Compte proprietaire : %O", compteUsager)
    debug("PKI login proprietaire : %O", req.amqpdao.pki)
    const idmg = req.amqpdao.pki.idmg  // Mode sans hebergemenet
    userInfo.idmgCompte = idmg
    userInfo.estProprietaire = true
    if(compteUsager.nomUsager) {
      userInfo.nomUsager = compteUsager.nomUsager
    } else {
      userInfo.nomUsager = 'proprietaire'
    }
  } else {
    debug("Injecter idmgCompte implicitement : %s", req.idmgCompte)
    userInfo.idmgCompte = req.idmgCompte
    userInfo.nomUsager = nomUsager
  }

  // Copier userInfo dans session
  Object.assign(req.session, userInfo)
  debug("Contenu session : %O", req.session)

  next()
}

function lireEtatIdmgNavigateur(listeNavigateurs, motdepassePartielNavigateur, idmgs) {

  const motdepassePartielClientBuffer = Buffer.from(motdepassePartielNavigateur, 'base64')

  // Restructurer la liste des navigateurs par hachage : {idmg, cert, cle, motdepasse}
  const idmgsActifs = []
  const idmgsInactifs = []
  for(let idmg in idmgs) {
    const infoIdmg = idmgs[idmg]
    var idmgActif = false
    for (let hachageNavi in infoIdmg.navigateurs) {
      if(listeNavigateurs.includes(hachageNavi)) {
        const infoNavi = infoIdmg.navigateurs[hachageNavi]

        // Match sur hachage du certificate de navigateur
        // Verifier si le cert est valide, cle match, mot de passe
        const motdepasseNavigateur = Buffer.concat([
          Buffer.from(infoNavi.motdepassePartiel, 'base64'),
          motdepassePartielClientBuffer
        ]).toString('base64')

        debug("Info navig, mot de passe : %s", motdepasseNavigateur)
        debug(infoNavi.cleChiffree)

        if( chargerClePrivee(infoNavi.cleChiffree, {password: motdepasseNavigateur}) ) {

          const cert = chargerCertificatPEM(infoNavi.certificat)
          if( cert.validity.notAfter.getTime() > new Date().getTime() ) {

            idmgActif = true
            break

          }

        }

      }
    }
    if(idmgActif) idmgsActifs.push(idmg)  // Ce idmg est valide et actif pour ce navigateur
    else idmgsInactifs.push(idmg)
  }

  const userInfo = {}
  userInfo.idmgsActifs = idmgsActifs
  if( idmgsInactifs.length > 0 ) {
    userInfo.idmgsInactifs = idmgsInactifs
  }
  userInfo.motdepassePartielNavigateur = motdepassePartielNavigateur

  return userInfo
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
  debug("Preparer inscription")
  debug(req.body)

  // Generer une nouvelle keypair et CSR
  const {clePriveePem, csrPem} = genererCSRIntermediaire()

  const reponse = {csrPem}

  // Conserver la cle privee dans la session usager
  req.session.clePriveeComptePem = clePriveePem

  // Generer challenge pour le certificat
  reponse.challengeCertificat = {
    date: new Date().getTime(),
    data: Buffer.from(randomBytes(32)).toString('base64'),
  }
  req.session[CONST_CERTIFICAT_AUTH_CHALLENGE] = reponse.challengeCertificat

  // Si U2F selectionne, on genere aussi un challenge
  if(req.body.u2fRegistration) {
    let nomUsager = req.body.nomUsager

    const challengeInfo = {
        relyingParty: { name: req.hostname },
        user: { id: nomUsager, name: nomUsager }
    }

    const u2fRegistrationRequest = generateRegistrationChallenge(challengeInfo);
    req.session[CONST_U2F_REGISTRATION_CHALLENGE] = u2fRegistrationRequest.challenge
    reponse.u2fRegistrationRequest = u2fRegistrationRequest
  }

  // Si Google Authenticator est selectionne, on genere aussi un challenge

  // Retourner le CSR du certificat infermediaire
  return res.send(reponse)

}

async function preparerCertificatNavigateur(req, res, next) {

  debug("preparerCertificatNavigateur, usager %s", req.nomUsager)
  // debug(req.compteUsager)

  const motdepasseHashRecu = req.body['motdepasse-hash'],
        idmgCompte = req.compteUsager.idmgCompte,
        csrNavigateurPem = req.body['csr']

  if( req.compteUsager.idmgs && req.compteUsager.idmgs[idmgCompte] ) {
    const infoCompteIdmg = req.compteUsager.idmgs[idmgCompte]
    const clePriveeCompteChiffree = infoCompteIdmg.cleChiffreeCompte

    debug("Cle chiffree compte")
    // debug(clePriveeCompteChiffree)

    if( infoCompteIdmg && clePriveeCompteChiffree ) {
      // Verifier que le mot de passe est correct - on tente de dechiffrer la cle de compte
      const clePriveeCompte = chargerClePrivee(clePriveeCompteChiffree, {password: motdepasseHashRecu})
      if( clePriveeCompte ) {
        debug("Cle privee du compte dechiffree OK, mot de passe verifie")

        const certIntermediairePEM = infoCompteIdmg.certificatComptePem

        // Generer nouveau certificat pour le navigateur
        const {cert: certNavigateur, pem: certNavigateurPem} = await genererCertificatNavigateur(
          idmgCompte, req.nomUsager, csrNavigateurPem, certIntermediairePEM, clePriveeCompte)

        const fullchainList = [
          certNavigateurPem,
          infoCompteIdmg.certificatComptePem,
          infoCompteIdmg.certificatMillegrillePem,
        ]
        const fullchainPem = fullchainList.join('\n')

        // Creer usager
        const userInfo = {
          idmg: idmgCompte,
          certificat: certNavigateurPem,
          fullchain: fullchainPem,
          expiration: Math.ceil(certNavigateur.validity.notAfter.getTime() / 1000)
        }

        // if( req.body.u2fRegistrationJson && req.session[CONST_U2F_REGISTRATION_CHALLENGE] ) {
        //   debug("Verification cle U2F")
        //   const { key, challenge } = parseRegisterRequest(req.body.u2fRegistrationJson);
        //   if( challenge === req.session[CONST_U2F_REGISTRATION_CHALLENGE] ) {
        //     debug("Activation cle U2F")
        //     userInfo.u2f = [key]
        //   } else {
        //     debug("Mismatch challenge U2F")
        //   }
        // }

        debug("User info pour sauvegarde nouvelle cle navigateur")
        debug(userInfo)

        // await req.comptesUsagers.ajouterCertificatNavigateur(req.nomUsager, userInfo)

        return res.status(201).send(userInfo)

      }
    }
  }

  // Retourner le CSR du certificat infermediaire
  return res.sendStatus(403)  // res.send(reponse)
}

module.exports = {
  initialiser, challengeRegistrationU2f, verifierChallengeRegistrationU2f,
  PBKDF2_KEYLEN, PBKDF2_HASHFUNCTION
}
