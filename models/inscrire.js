const debug = require('debug')('millegrilles:maitrecomptes:inscrire')
const multibase = require('multibase')
const {pki: forgePki} = require('@dugrema/node-forge')
// const { hacher } = require('@dugrema/millegrilles.common/lib/hachage')
const { hacher } = require('@dugrema/millegrilles.nodejs/src/hachage')

async function inscrire(socket, params) {

  const session = socket.handshake.session,
        headers = socket.handshake.headers

  debug("Inscrire %O\nHeaders: %O\nSession: %O", params, headers, session)

  const ipClient = headers['x-forwarded-for']

  // Extraire contenu du body
  const { nomUsager, csr } = params

  if( ! nomUsager || ! csr ) {
    debug("Erreur demande, nomUsager %O, csr : %O", nomUsager, csr)
    return {err: 'Parametres nomUsager ou csr vides'}
  }

  // Calculer fingerprint_pk
  const csrForge = forgePki.certificationRequestFromPem(csr)
  // const publicKeyPem = forgePki.publicKeyToPem(csrForge.publicKey)
  // const fingerprintPk = await hacherPem(publicKeyPem)
  // Le fingerprint d'une cle Ed25519 est la cle elle meme (32 bytes)
  const fingerprintPk = String.fromCharCode.apply(null, multibase.encode('base64', csrForge.publicKey.publicKeyBytes))
  debug("FingerprintPK : %O", fingerprintPk)

  if(!csrForge.verify()) {
    debug("CSR invalide (verify false)")
    return {ok: false, err: "CSR invalide (verify false)"}
  }

  // Le userId est un hachage SHA2-256 en base58btc (multihash, multibase)
  // La valeur hachee est "nomUsager:IDMG:fingerprintPk"
  const idmg = socket.amqpdao.pki.idmg
  const encoder = new TextEncoder()
  const valeurHachage = [nomUsager, idmg, fingerprintPk].join(':')
  const userId = await hacher(encoder.encode(valeurHachage), {hashingCode: 'blake2s-256', encoding: 'base58btc'})
  debug("Usager : %s, valeur hachage: %s, userId: %s, csr\n%O", nomUsager, valeurHachage, userId, csr)

  const comptesUsagers = socket.comptesUsagersDao

  // Creer usager
  try {
    debug("Inscrire usager %s (ip: %s), fingerprint_pk", nomUsager, ipClient, fingerprintPk)
    const reponseCreationCompte = await comptesUsagers.inscrireCompte(nomUsager, userId, fingerprintPk, '1.public', csr)
    debug("Inscription du compte usager %s (%s) completee", nomUsager, userId)

    if(!reponseCreationCompte.ok) {
      console.error("inscrire.inscrire ERROR Echec creation compte usager, reponse null")
      return ({err: 'Erreur creation compte usager'})
    }

    // L'inscription (et authentification) reussie.
    // Initialisation info usager pour la session
    socket.compteUsager = {}

    session.nomUsager = nomUsager
    session.userId = userId
    session.ipClient = ipClient
    session.auth = { certificat: 1, associationCleManquante: 1 }
    session.save()

    debug("Session usager apres inscription : %O", session)

    // Init authentification session
    // debug("Preparer certificat navigateur")
    // const resultatCertificat = await comptesUsagers.signerCertificatNavigateur(csr, nomUsager, userId)
    // debug("Reponse signature certificat:\n%O", resultatCertificat)
    //
    // if(resultatCertificat.err) return resultatCertificat

    // Enregistrer listeners prives et proteges
    debug("Activer listeners prives et proteges suite a l'inscription d'un nouveau compte")
    socket.activerListenersPrives()
    socket.activerModeProtege()

    return {
      certificat: reponseCreationCompte.certificat,
      userId,
    }

  } catch(err) {
    console.error("inscrire.inscrire ERREUR %O", err)
    return {err: ''+err, stack: err.stack}
  }
}

// function reponseInscription(req, res, next) {
//   const reponse = {fullchain: res.fullchainPem}
//   return res.status(201).send(reponse)
// }

module.exports = {
  inscrire,
  // reponseInscription,
}
