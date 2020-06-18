import axios from 'axios'
import { genererCertificatMilleGrille, genererCertificatIntermediaire } from 'millegrilles.common/lib/cryptoForge'
import {
    enveloppePEMPublique, enveloppePEMPrivee, chiffrerPrivateKeyPEM,
    CertificateStore, matchCertificatKey, signerContenuString, chargerClePrivee,
    calculerIdmg, chargerCertificatPEM,
  } from 'millegrilles.common/lib/forgecommon'
import { CryptageAsymetrique, genererAleatoireBase64 } from 'millegrilles.common/lib/cryptoSubtle'

const cryptageAsymetriqueHelper = new CryptageAsymetrique()

export async function genererNouveauCompte(url) {
  const {
    certPEM: certMillegrillePEM,
    clePriveeChiffree: clePriveeMillegrilleChiffree,
    motdepasseCle: motdepasseCleMillegrille,
  } = await genererNouveauCertificatMilleGrille()

  const {
    certPem: certIntermediairePEM,
    motdepassePartiel: motdepasseIntermediairePartiel,
  } = await preparerInscription(url, {certMillegrillePEM, clePriveeMillegrilleChiffree, motdepasseCleMillegrille})

  return {
    certMillegrillePEM,
    clePriveeMillegrilleChiffree,
    motdepasseCleMillegrille,
    certIntermediairePEM,
    motdepasseIntermediairePartiel
  }
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

  // Aller chercher un CSR pour le nouveau compte
  const reponsePreparation = await axios.post(url)
  console.debug("Reponse preparation inscription compte")
  console.debug(reponsePreparation)

  // Creer le certificat intermediaire
  const csrPEM = reponsePreparation.data.csrPem
  const {cert, pem: certPem} = await genererCertificatIntermediaire(idmg, certMillegrille, clePriveeMillegrille, {csrPEM})

  // Preparer secret pour mot de passe partiel navigateur
  const nbBytesMotdepasse = Math.ceil(Math.random() * 32) + 32  // Aleat entre 32 et 64 bytes
  const motdepassePartiel = genererAleatoireBase64(nbBytesMotdepasse)

  // Au besoin, repondre au challenge U2F

  // Au besoin, repondre au challenge Google Authenticator

  return {certPem, motdepassePartiel}
}
