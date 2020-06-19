import axios from 'axios'
import { genererCertificatMilleGrille, genererCertificatIntermediaire } from 'millegrilles.common/lib/cryptoForge'
import {
    enveloppePEMPublique, enveloppePEMPrivee, chiffrerPrivateKeyPEM,
    CertificateStore, matchCertificatKey, signerContenuString, chargerClePrivee,
    calculerIdmg, chargerCertificatPEM,
  } from 'millegrilles.common/lib/forgecommon'
import { CryptageAsymetrique, genererAleatoireBase64 } from 'millegrilles.common/lib/cryptoSubtle'

const cryptageAsymetriqueHelper = new CryptageAsymetrique()

export async function genererNouveauCompte(url, params) {
  const {
    certPEM: certMillegrillePEM,
    clePriveeChiffree: clePriveeMillegrilleChiffree,
    motdepasseCle: motdepasseCleMillegrille,
  } = await genererNouveauCertificatMilleGrille()

  console.debug("Params genererNouveauCompte")
  console.debug(params)

  const reponseInscription = await preparerInscription(
    url,
    {certMillegrillePEM, clePriveeMillegrilleChiffree, motdepasseCleMillegrille, ...params}
  )

  console.debug("Reponse inscription")
  console.debug(reponseInscription)

  const reponse = {
    certMillegrillePEM,
    clePriveeMillegrilleChiffree,
    motdepasseCleMillegrille,
    certIntermediairePEM: reponseInscription.certPem,
    motdepassePartiel: reponseInscription.motdepassePartiel,
  }
  if(reponseInscription.u2fRegistrationRequest) {
    reponse.u2fRegistrationRequest = reponseInscription.u2fRegistrationRequest
  }

  return reponse
}

// Genere un nouveau certificat de MilleGrille racine
export async function genererNouveauCertificatMilleGrille() {

  // Preparer secret pour mot de passe partiel navigateur
  const motdepasseCle = genererAleatoireBase64(64).replace(/=/g, '')

  // Generer nouvelles cle privee, cle publique
  const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
  const clePriveePEM = enveloppePEMPrivee(clePrivee, true),
        clePubliquePEM = enveloppePEMPublique(clePublique)
  const clePriveeChiffree = await chiffrerPrivateKeyPEM(clePriveePEM, motdepasseCle)

  // console.debug("Cle Privee Chiffree")
  // console.debug(clePriveeChiffree)

  // Importer dans forge, creer certificat de MilleGrille
  const {cert, pem: certPEM, idmg: idmgUsager} = await genererCertificatMilleGrille(clePriveePEM, clePubliquePEM)

  return {
    clePriveePEM, clePubliquePEM, cert, certPEM, idmgUsager, clePriveeChiffree, motdepasseCle
  }
}

// Recupere un CSR a signer avec la cle de MilleGrille
export async function preparerInscription(url, pkiMilleGrille) {
  console.debug("PKI Millegrille params")
  console.debug(pkiMilleGrille)

  const {certMillegrillePEM, clePriveeMillegrilleChiffree, motdepasseCleMillegrille} = pkiMilleGrille

  // Extraire PEM vers objets nodeforge
  const certMillegrille = chargerCertificatPEM(certMillegrillePEM)
  const clePriveeMillegrille = chargerClePrivee(clePriveeMillegrilleChiffree, {password: motdepasseCleMillegrille})

  // Calculer IDMG a partir du certificat de millegrille
  const idmg = calculerIdmg(certMillegrillePEM)

  const parametresRequete = {nomUsager: pkiMilleGrille.nomUsager}
  if(pkiMilleGrille.u2f) {
    parametresRequete.u2fRegistration = true
  }

  // Aller chercher un CSR pour le nouveau compte
  const reponsePreparation = await axios.post(url, parametresRequete)
  console.debug("Reponse preparation inscription compte")
  console.debug(reponsePreparation.data)

  // Creer le certificat intermediaire
  const csrPEM = reponsePreparation.data.csrPem
  const {cert, pem: certPem} = await genererCertificatIntermediaire(idmg, certMillegrille, clePriveeMillegrille, {csrPEM})

  // Preparer secret pour mot de passe partiel navigateur
  const nbBytesMotdepasse = Math.ceil(Math.random() * 32) + 32  // Aleat entre 32 et 64 bytes
  const motdepassePartiel = genererAleatoireBase64(nbBytesMotdepasse)

  return {
    certPem,
    motdepassePartiel,
    u2fRegistrationRequest: reponsePreparation.data.u2fRegistrationRequest
  }
}
