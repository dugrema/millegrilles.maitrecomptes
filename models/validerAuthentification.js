const debug = require('debug')('millegrilles:maitrecomptes:validerAuthentification')
const {pbkdf2} = require('crypto')
const authenticator = require('authenticator')
const { parseLoginRequest, verifyAuthenticatorAssertion } = require('@webauthn/server')

const PBKDF2_KEYLEN = 64,
      PBKDF2_HASHFUNCTION = 'sha512'

async function verifierMotdepasse(compteUsager, motdepasse) {
  const {motdepasseHash: motdepasseActuel, salt, iterations} = compteUsager.motdepasse

  // Verifier le mot de passe en mode pbkdf2
  return await new Promise((resolve, reject) => {
    pbkdf2(motdepasse, salt, iterations, PBKDF2_KEYLEN, PBKDF2_HASHFUNCTION,
      (err, derivedKey) => {
        if (err) return reject(err)

        const motdepasseCalcule = derivedKey.toString('base64')
        debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", motdepasseCalcule, iterations, salt)

        return resolve(motdepasseCalcule === motdepasseActuel)
      }
    )
  })

}

function verifierSignatureCertificat(compteUsager, reponseCertificat) {

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

function verifierU2f(compteUsager, sessionAuthChallenge, reponseU2f) {

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

module.exports = {verifierMotdepasse, verifierSignatureCertificat, verifierU2f, verifierTotp}
