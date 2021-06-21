const debug = require('debug')('millegrilles:maitrecomptes:inscrire')
const {v4: uuidv4} = require('uuid')
const multibase = require('multibase')
const {pki: forgePki} = require('node-forge')
const { hacherPem } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { hacher } = require('@dugrema/millegrilles.common/lib/hachage')

// async function inscrire(req, res, next) {
//   debug("Inscrire / headers, body : %O\n%O", req.headers, req.body)
//   // debug(req.headers)
//   debug("Session : %O", req.session)
//
//   const ipClient = req.headers['x-forwarded-for']
//
//   // Extraire contenu du body
//   const { nomUsager, csr } = req.body
//
//   // const usager = req.body['nom-usager']
//   // const certMillegrillePEM = req.body['cert-millegrille-pem']
//   // const certIntermediairePEM = req.body['cert-intermediaire-pem']
//   // const motdepassePartielClient = req.body['motdepasse-partiel']
//   // const motdepasseHash = req.body['motdepasse-hash']
//
//   // const certificatCompte = forgePki.certificateFromPem(certIntermediairePEM)
//
//   // const idmg = getIdmg(certIntermediairePEM)
//
//   if( ! nomUsager || ! csr ) {
//     debug("Erreur demande, nomUsager %O, csr : %O", nomUsager, csr)
//     return res.sendStatus(500)
//   }
//
//   // Calculer fingerprint_pk
//   const csrForge = forgePki.certificationRequestFromPem(csr)
//   const publicKeyPem = forgePki.publicKeyToPem(csrForge.publicKey)
//   const fingerprintPk = await hacherPem(publicKeyPem)
//
//   if(!csrForge.verify()) {
//     debug("CSR invalide (verify false)")
//     return res.sendStatus(400)
//   }
//
//   // Generer nouveau userId (uuidv4, 16 bytes)
//   // const userIdArray = new Uint8Array(16)
//   // uuidv4(null, userIdArray)
//   // const userId = String.fromCharCode.apply(null, multibase.encode('base58btc', new Uint8Array(userIdArray)))
//
//   // Le nom d'usager est un hachage SHA2-256 en base58btc (multihash, multibase)
//   // La valeur hachee est "nomUsager:IDMG:fingerprintPk"
//   const idmg = req.amqpdao.pki.idmg
//   const valeurHachage = [nomUsager, idmg, fingerprintPk].join(':')
//   const userId = await hacher(valeurHachage, {hashingCode: 'sha2-256', encoding: 'base58btc'})
//   debug("Usager : %s, valeur hachage: %s, userId: %s, csr\n%O", nomUsager, valeurHachage, userId, csr)
//
//   debug("Inscrire usager %s (ip: %s), fingerprint_pk", nomUsager, ipClient, fingerprintPk)
//   req.nomUsager = nomUsager
//   req.ipClient = ipClient
//
//   debug("Preparer certificat navigateur")
//
//   // const {cert: certNavigateur, pem: certNavigateurPem} = await genererCertificatNavigateur(
//   //   idmg, usager, csrNavigateur, certIntermediairePEM, clePriveeCompte)
//
//   const comptesUsagers = req.comptesUsagersDao
//   const resultatCertificat = await comptesUsagers.signerCertificatNavigateur(csr, nomUsager, userId)
//
//   debug("Reponse signature certificat:\n%O", resultatCertificat)
//
//   // const fullchainList = [
//   //   certNavigateurPem,
//   //   certIntermediairePEM,
//   //   certMillegrillePEM,
//   // ]
//   // debug("Navigateur fullchain :\n%O", fullchainList)
//   const fullchainPem = resultatCertificat.fullchain.join('\n')
//   // debug(certNavigateurPem)
//
//   // Creer usager
//   try {
//     const reponseCreationCompte = await comptesUsagers.inscrireCompte(nomUsager, userId, fingerprintPk)
//     debug("Reponse inscription du compte : %O", reponseCreationCompte)
//     res.fullchainPem = fullchainPem
//
//     // Initialisation info usager pour la session
//     req.nomUsager = nomUsager
//     req.userId = userId
//     req.compteUsager = {}
//     req.ipClient = req.headers['x-forwarded-for']
//
//     // Init authentification session
//     req.session.authentificationPrimaire = 'certificat'
//     req.session.niveauSecurite = '2.prive'
//
//   } catch(err) {
//     console.error("inscrire.inscrire ERREUR %O", err)
//     return res.status(500).send({err: ''+err})
//   }
//
//   // Next pour creer session - reponse transmise a la fin
//   next()
// }

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
  const publicKeyPem = forgePki.publicKeyToPem(csrForge.publicKey)
  const fingerprintPk = await hacherPem(publicKeyPem)

  if(!csrForge.verify()) {
    debug("CSR invalide (verify false)")
    return {err: "CSR invalide (verify false)"}
  }

  // Le userId est un hachage SHA2-256 en base58btc (multihash, multibase)
  // La valeur hachee est "nomUsager:IDMG:fingerprintPk"
  const idmg = socket.amqpdao.pki.idmg
  const valeurHachage = [nomUsager, idmg, fingerprintPk].join(':')
  const userId = await hacher(valeurHachage, {hashingCode: 'sha2-256', encoding: 'base58btc'})
  debug("Usager : %s, valeur hachage: %s, userId: %s, csr\n%O", nomUsager, valeurHachage, userId, csr)

  // socket.nomUsager = nomUsager
  // socket.userId = userId
  // socket.ipClient = ipClient
  const comptesUsagers = socket.comptesUsagersDao

  // Creer usager
  try {
    debug("Inscrire usager %s (ip: %s), fingerprint_pk", nomUsager, ipClient, fingerprintPk)
    const reponseCreationCompte = await comptesUsagers.inscrireCompte(nomUsager, userId, fingerprintPk)
    debug("Inscription du compte usager %s (%s) completee", nomUsager, userId)

    if(!reponseCreationCompte.ok) {
      console.error("inscrire.inscrire ERROR Echec creation compte usager, reponse null")
      return ({err: 'Erreur creation compte usager'})
    }

    // L'inscription (et authentification) reussie.
    // Initialisation info usager pour la session
    // socket.nomUsager = nomUsager
    // socket.userId = userId
    socket.compteUsager = {}
    // socket.ipClient = ipClient

    session.nomUsager = nomUsager
    session.userId = userId
    session.ipClient = ipClient
    session.auth = { certificat: 1, associationCleManquante: 1 }
    session.save()

    debug("Session usager apres inscription : %O", session)

    // Init authentification session
    // session.authentificationPrimaire = 'certificat'
    // session.niveauSecurite = '2.prive'

    debug("Preparer certificat navigateur")
    const resultatCertificat = await comptesUsagers.signerCertificatNavigateur(csr, nomUsager, userId)
    debug("Reponse signature certificat:\n%O", resultatCertificat)

    if(resultatCertificat.err) return resultatCertificat

    // Enregistrer listeners prives et proteges
    debug("Activer listeners prives et proteges suite a l'inscription d'un nouveau compte")
    socket.activerListenersPrives()
    socket.activerModeProtege()

    return {
      certificat: resultatCertificat.fullchain,
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
