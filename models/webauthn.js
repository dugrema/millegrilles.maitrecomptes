const debug = require('debug')('millegrilles:maitrecomptes:webauthn')
const multibase = require('multibase')
const base64url = require('base64url')
const { v4: uuidv4 } = require('uuid')
// const crypto = require('crypto')
// const base64url = require('base64url')
// const express = require('express')
const { Fido2Lib } = require("fido2-lib")
// const bodyParser = require('body-parser')

const CONST_CHALLENGE = 'challenge'

var _f2l = null
var _hostname = null

function init(hostname, idmg) {
  const options = {
    timeout: 60000,
    rpId: hostname,  // "mg-dev4.maple.maceroc.com",
    rpName: idmg,  // "MilleGrilles",
    // rpIcon: "https://example.com/logo.png",
    challengeSize: 128,
    attestation: "none",
    cryptoParams: [-7, -257],
    // authenticatorAttachment: "platform",
    // authenticatorAttachment: "cross-platform",
    authenticatorRequireResidentKey: false,
    authenticatorUserVerification: "preferred"
  }
  debug("Initialisation webauthn : %O", options)

  const f2l = new Fido2Lib(options)

  // Conserver instance
  _f2l = f2l
  _hostname = hostname
}

async function genererChallengeRegistration(req, res, next) {
  debug("genererChallengeRegistration: %O", req.body)
  // let nomUsager;
  // if(!req.session.nomUsager) {
  //   // Probablement un premier login pour prise de possession (logique d'auth s'applique plus loin)
  //   nomUsager = 'proprietaire'
  // } else if(req.session.estProprietaire) {
  //   // nomUsager = 'proprietaire'
  //   console.error("Session deja identifiee comme proprietaire")
  //   return res.sendStatus(403)
  // } else {
  //   nomUsager = req.session.nomUsager || req.nomUsager || req.body.nomUsager
  // }
  var {userId, nomUsager} = req.session

  var userIdArray = null
  if(userId) {
    userIdArray = new Uint8Array(String.fromCharCode.apply(null, multibase.decode(userId)))
  } else {
    nomUsager = req.nomUsager || req.body.nomUsager
    // Generer userId random avec uuidv4
    userIdArray = new Uint8Array(16)
    uuidv4(null, userIdArray)
  }

  const registrationChallenge = await _genererRegistrationOptions(userIdArray, nomUsager)
  debug("Registration challenge : %O", registrationChallenge)

  req.session[CONST_CHALLENGE] = {
    challenge: registrationChallenge.challenge,
    userId: registrationChallenge.userId,
  }

  return res.send({
    challenge: registrationChallenge.attestation,
  })
}

async function verifierChallengeRegistration(userId, challenge, response) {
  const challengeArray = multibase.decode(challenge)

  const attestationExpectations = {
      challenge: challengeArray,
      origin: `https://${_hostname}`,
      factor: 'either'
  }
  debug("Attestation expectations : %O", attestationExpectations)

  const rawId = new Uint8Array(Buffer.from(base64url.decode(response.id))).buffer
  // const clientDataJSON = new Uint8Array(multibase.decode(response.response.clientDataJSON))
  // const attestationObject = new Uint8Array(multibase.decode(response.response.attestationObject))
  const clientAttestationResponse = {
    rawId,
    response: response.response,
  }
  debug("Client attestation response : %O", clientAttestationResponse)

  var regResult = await _f2l.attestationResult(clientAttestationResponse, attestationExpectations)
  debug("Registration result OK : %O", regResult)

  const authnrData = regResult.authnrData

  const credId = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(authnrData.get('credId'))))
  const counter = authnrData.get('counter') || 0
  const publicKeyPem = authnrData.get('credentialPublicKeyPem')

  const informationCle = {
    credId,
    counter,
    publicKeyPem,
    type: 'public-key',
  }

  return informationCle
}

async function genererChallenge(compteUsager) {
  throw new Error("Fix me")
}

async function authentifier(req, res, next) {

  debug("Authentifier U2F\nSession: %O\nBody: %O", req.session, req.body)

  const sessionAuthChallenge = req.session[CONST_CHALLENGE],
        infoCompteUsager = req.compteUsager

  delete req.session[CONST_CHALLENGE]

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

async function _genererRegistrationOptions(userId, nomUsager) {
  debug("Registration request, usager %s", nomUsager)
  const attestationParams = {
      relyingParty: { name: _hostname },
      user: { id: userId, name: nomUsager }
  }
  debug("Registration attestation params : %O", attestationParams)

  const attestationOptions = await _f2l.attestationOptions()
  debug("Registration options : %O", attestationOptions)

  const challenge = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(attestationOptions.challenge)))
  const userIdString = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(userId)))

  var attestationOptionsSerialized = {
    ...attestationOptions,
    user: {
      ...attestationOptions.user,
      id: userIdString,
    },
    challenge,
  }
  debug("Attestation opts serialized : %O", attestationOptionsSerialized)

  // const attestationExpectations = {
  //     challenge: attestationOptions.challenge,
  //     origin: `https://${_hostname}`,
  //     factor: "either"
  // }
  // debug("Attestation expectations : %O", attestationExpectations)

  return {
    userId: userIdString,
    challenge,  // Retourner challenger encode pour serialiser dans la session
    attestation: attestationOptionsSerialized,
    // expectations: attestationExpectations,
  }
}

module.exports = {
  init,
  genererChallengeRegistration, verifierChallengeRegistration,
  genererChallenge, authentifier,
}
