const debug = require('debug')('millegrilles:maitrecomptes:inscrire')
const {v4: uuidv4} = require('uuid')
const multibase = require('multibase')
const {pki: forgePki} = require('node-forge')
const { hacherPem } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { hacher } = require('@dugrema/millegrilles.common/lib/hachage')

async function inscrire(req, res, next) {
  debug("Inscrire / headers, body : %O\n%O", req.headers, req.body)
  // debug(req.headers)
  debug("Session : %O", req.session)

  const ipClient = req.headers['x-forwarded-for']

  // Extraire contenu du body
  const { nomUsager, csr } = req.body

  // const usager = req.body['nom-usager']
  // const certMillegrillePEM = req.body['cert-millegrille-pem']
  // const certIntermediairePEM = req.body['cert-intermediaire-pem']
  // const motdepassePartielClient = req.body['motdepasse-partiel']
  // const motdepasseHash = req.body['motdepasse-hash']

  // const certificatCompte = forgePki.certificateFromPem(certIntermediairePEM)

  // const idmg = getIdmg(certIntermediairePEM)

  if( ! nomUsager || ! csr ) {
    debug("Erreur demande, nomUsager %O, csr : %O", nomUsager, csr)
    return res.sendStatus(500)
  }

  // Calculer fingerprint_pk
  const csrForge = forgePki.certificationRequestFromPem(csr)
  const publicKeyPem = forgePki.publicKeyToPem(csrForge.publicKey)
  const fingerprintPk = await hacherPem(publicKeyPem)

  if(!csrForge.verify()) {
    debug("CSR invalide (verify false)")
    return res.sendStatus(400)
  }

  // Generer nouveau userId (uuidv4, 16 bytes)
  // const userIdArray = new Uint8Array(16)
  // uuidv4(null, userIdArray)

  // Le nom d'usager est un hachage SHA2-256 en base58btc (multihash, multibase)
  // La valeur hachee est "nomUsager:IDMG:fingerprintPk"
  const idmg = req.amqpdao.pki.idmg
  const valeurHachage = [nomUsager, idmg, fingerprintPk].join(':')
  const userId = await hacher(valeurHachage, {hashingCode: 'sha2-256', encoding: 'base58btc'})

  // const userId = String.fromCharCode.apply(null, multibase.encode('base58btc', new Uint8Array(userIdArray)))

  debug("Usager : %s, userId: %s, csr\n%O", nomUsager, userId, csr)

  debug("Inscrire usager %s (ip: %s), fingerprint_pk", nomUsager, ipClient, fingerprintPk)
  req.nomUsager = nomUsager
  req.ipClient = ipClient

  debug("Preparer certificat navigateur")

  // const {cert: certNavigateur, pem: certNavigateurPem} = await genererCertificatNavigateur(
  //   idmg, usager, csrNavigateur, certIntermediairePEM, clePriveeCompte)

  const comptesUsagers = req.comptesUsagersDao
  const resultatCertificat = await comptesUsagers.signerCertificatNavigateur(csr, nomUsager, userId)

  debug("Reponse signature certificat:\n%O", resultatCertificat)

  // const fullchainList = [
  //   certNavigateurPem,
  //   certIntermediairePEM,
  //   certMillegrillePEM,
  // ]
  // debug("Navigateur fullchain :\n%O", fullchainList)
  const fullchainPem = resultatCertificat.fullchain.join('\n')
  // debug(certNavigateurPem)

  // Creer usager
  const reponseCreationCompte = await comptesUsagers.inscrireCompte(nomUsager, userId, fingerprintPk)

  debug("Reponse inscription du compte : %O", reponseCreationCompte)

  const reponse = {fullchain: fullchainPem}

  return res.status(201).send(reponse)
}

module.exports = {
  inscrire
}
