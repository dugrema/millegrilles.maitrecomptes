const debug = require('debug')('millegrilles:maitrecomptes:validerAuthentification')
const {pbkdf2} = require('crypto')
const authenticator = require('authenticator')
const { parseLoginRequest, verifyAuthenticatorAssertion } = require('@webauthn/server')
const { validerChaineCertificats, verifierChallengeCertificat, splitPEMCerts } = require('millegrilles.common/lib/forgecommon')

const PBKDF2_KEYLEN = 64,
      PBKDF2_HASHFUNCTION = 'sha512'

function verifierMotdepasse(compteUsager, motdepasse) {
  const {motdepasseHash: motdepasseActuel, salt, iterations} = compteUsager.motdepasse

  // Verifier le mot de passe en mode pbkdf2
  return new Promise((resolve, reject) => {
    pbkdf2(motdepasse, salt, iterations, PBKDF2_KEYLEN, PBKDF2_HASHFUNCTION,
      (err, derivedKey) => {
        if (err) return reject(err)

        const motdepasseCalcule = derivedKey.toString('base64')
        const valide = motdepasseCalcule === motdepasseActuel
        debug("Rehash du hash avec pbkdf2 valide : %s\n%s (iterations: %d, salt: %s)\nHash sauvegarde : %O",
          valide, motdepasseCalcule, iterations, salt, motdepasseActuel)

        return resolve(valide)
      }
    )
  })

}

function verifierSignatureCertificat(idmg, compteUsager, chainePem, challengeSession, challengeBody) {
  debug("verifierSignatureCertificat : idmg=%s", idmg)
  const { cert: certificat, idmg: idmgChaine } = validerChaineCertificats(chainePem)

  const commonName = certificat.subject.getField('CN').value,
        organizationalUnit = certificat.subject.getField('OU').value

  if(!idmg || idmg !== idmgChaine) {
    console.error("Le certificat ne correspond pas a la millegrille : idmg %s !== %s", idmg, idmgChaine)
  } else if(compteUsager.nomUsager !== commonName) {
    console.error("Le certificat ne correspond pas a l'usager : CN=" + commonName)
  } else if(organizationalUnit !== 'Navigateur') {
    console.error("Certificat fin n'est pas un certificat de Navigateur. OU=" + organizationalUnit)
  } else if( challengeBody.date !== challengeSession.date ) {
    console.error("Challenge certificat mismatch date")
  } else if( challengeBody.data !== challengeSession.data ) {
    console.error("Challenge certificat mismatch data")
  } else {

    debug("Verification authentification par certificat pour idmg %s, signature :\n%s", idmg, challengeBody['_signature'])

    // Verifier les certificats et la signature du message
    // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
    debug("authentifierCertificat, cert :\n%O\nchallengeJson\n%O", certificat, challengeBody)
    const valide = verifierChallengeCertificat(certificat, challengeBody)

    return { valide, certificat, idmg }

  }

  return { valide: false }
}

function verifierSignatureMillegrille(certificatMillegrille, challengeSession, challengeBody) {
  // Validation de la signature de la cle de MilleGrille

  if( challengeBody.date !== challengeSession.date ) {
    console.error("Challenge certificat mismatch date")
  } else if( challengeBody.data !== challengeSession.data ) {
    console.error("Challenge certificat mismatch data")
  } else {

    debug("Verification authentification par certificat, signature :\n%s", challengeBody['_signature'])

    // Verifier les certificats et la signature du message
    // Permet de confirmer que le client est bien en possession d'une cle valide pour l'IDMG
    debug("authentifierCertificat, cert :\n%O\nchallengeJson\n%O", certificatMillegrille, challengeBody)
    const valide = verifierChallengeCertificat(certificatMillegrille, challengeBody)

    return { valide, certificatMillegrille }
  }

  return { valide: false }
}

async function verifierTotp(compteUsager, comptesUsagersDao, tokenTotp) {
  debug("Requete secret TOTP pour proprietaire")
  const infoUsagerTotp = compteUsager.totp
  const secretTotp = await comptesUsagersDao.requeteCleProprietaireTotp(infoUsagerTotp)
  debug("Recu secret TOTP pour proprietaire : %O", secretTotp)
  const cleTotp = secretTotp.totp

  const valide = authenticator.verifyToken(cleTotp, tokenTotp)

  return valide
}

async function genererKeyTotp() {
  const formattedKey = authenticator.generateKey(),
        titreApp = "MilleGrilles - DADADA",
        usager = 'proprietaire'

  const uri = authenticator.generateTotpUri(formattedKey, usager, titreApp, 'SHA1', 6, 30)

  const reponse = {
    formattedKey, usager, titreApp, uri
  }

  return reponse
}

function verifierU2f(compteUsager, sessionAuthChallenge, reponseU2f) {

  debug("VerifierU2F :\ncompteUsager : %O\nsessionAuthChallenge: %O\nreponseU2f: %O", compteUsager, sessionAuthChallenge, reponseU2f)

  const { challenge, keyId } = parseLoginRequest(reponseU2f)
  if (!challenge) {
    return false
  }

  if ( ! sessionAuthChallenge || sessionAuthChallenge.challenge !== challenge ) {
    return false
  }

  // Trouve la bonne cle a verifier dans la collection de toutes les cles
  var cle_match
  let cle_id_utilisee = reponseU2f.rawId

  let cles = compteUsager.u2f
  for(var i_cle in cles) {
    let cle = cles[i_cle]
    let credID = cle['credID']
    credID = credID.substring(0, cle_id_utilisee.length)

    if(credID === cle_id_utilisee) {
      cle_match = cle
      break
    }
  }

  if(!cle_match) {
    debug("Cle inconnue: %s", cle_id_utilisee)
    return false
  }

  const autorise = verifyAuthenticatorAssertion(reponseU2f, cle_match)

  return autorise

}

module.exports = {
  verifierMotdepasse, verifierSignatureCertificat, verifierU2f,
  verifierTotp, verifierSignatureMillegrille, genererKeyTotp
}
