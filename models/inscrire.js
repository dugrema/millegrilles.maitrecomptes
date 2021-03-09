const debug = require('debug')('millegrilles:maitrecomptes:inscrire')

async function inscrire(req, res, next) {
  debug("Inscrire / headers, body :")
  // debug(req.headers)
  debug(req.body)
  debug("Session")
  debug(req.session)

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
    return res.sendStatus(500)
  }
  debug("Usager : %s, csr\n%O", nomUsager, csr)

  debug("Inscrire usager %s (ip: %s)", nomUsager, ipClient)
  req.nomUsager = nomUsager
  req.ipClient = ipClient

  debug("Preparer certificat navigateur")

  // const {cert: certNavigateur, pem: certNavigateurPem} = await genererCertificatNavigateur(
  //   idmg, usager, csrNavigateur, certIntermediairePEM, clePriveeCompte)

  const comptesUsagers = req.comptesUsagers
  const resultatCertificat = await comptesUsagers.signerCertificatNavigateur(csr, nomUsager)

  debug("Reponse signature certificat:\n%O", resultatCertificat)

  // const fullchainList = [
  //   certNavigateurPem,
  //   certIntermediairePEM,
  //   certMillegrillePEM,
  // ]
  // debug("Navigateur fullchain :\n%O", fullchainList)
  // const fullchainPem = fullchainList.join('\n')
  // debug(certNavigateurPem)

  // Creer usager
  const reponseCreationCompte = await req.comptesUsagers.inscrireCompte(nomUsager)

  debug("Reponse inscription du compte : %O", reponseCreationCompte)

  debug("!!!! FIX-ME")
  res.sendStatus(500)


  // const reponse = {fullchain: fullchainPem}
  //
  // return res.status(201).send(reponse)

}

module.exports = {
  inscrire
}
