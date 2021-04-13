import axios from 'axios'
import { openDB } from 'idb'
import stringify from 'json-stable-stringify'
import { pki as forgePki} from 'node-forge'

import { genererCsrNavigateur, genererCertificatMilleGrille, genererCertificatIntermediaire } from '@dugrema/millegrilles.common/lib/cryptoForge'
import { createObjectStores } from '@dugrema/millegrilles.common/lib/browser/dbUsager'
import {
    enveloppePEMPublique, enveloppePEMPrivee, chiffrerPrivateKeyPEM,
    chargerClePrivee, sauvegarderPrivateKeyToPEM,
    calculerIdmg, hacherPem
  } from '@dugrema/millegrilles.common/lib/forgecommon'
import { CryptageAsymetrique, genererAleatoireBase64 } from '@dugrema/millegrilles.common/lib/cryptoSubtle'

// import {getCertificats, getClesPrivees} from '@dugrema/millegrilles.common/lib/browser/dbUsager'

const cryptageAsymetriqueHelper = new CryptageAsymetrique()

// export async function genererNouveauCompte(url, params) {
//   const {
//     certPEM: certMillegrillePEM,
//     clePriveeChiffree: clePriveeMillegrilleChiffree,
//     motdepasseCle: motdepasseCleMillegrille,
//   } = await genererNouveauCertificatMilleGrille()
//
//   console.debug("Params genererNouveauCompte")
//   console.debug(params)
//
//   const reponseInscription = await preparerInscription(
//     url,
//     {certMillegrillePEM, clePriveeMillegrilleChiffree, motdepasseCleMillegrille, ...params}
//   )
//
//   console.debug("Reponse inscription")
//   console.debug(reponseInscription)
//
//   const reponse = {
//     certMillegrillePEM,
//     clePriveeMillegrilleChiffree,
//     motdepasseCleMillegrille,
//     certIntermediairePEM: reponseInscription.certPem,
//     challengeCertificat: reponseInscription.challengeCertificat,
//   }
//   if(reponseInscription.u2fRegistrationRequest) {
//     reponse.u2fRegistrationRequest = reponseInscription.u2fRegistrationRequest
//   }
//
//   return reponse
// }

// // Genere un nouveau certificat de MilleGrille racine
// export async function genererNouveauCertificatMilleGrille() {
//
//   // Preparer secret pour mot de passe partiel navigateur
//   const motdepasseCle = genererAleatoireBase64(64).replace(/=/g, '')
//
//   // Generer nouvelles cle privee, cle publique
//   const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
//   const clePriveePEM = enveloppePEMPrivee(clePrivee, true),
//         clePubliquePEM = enveloppePEMPublique(clePublique)
//   const clePriveeChiffree = await chiffrerPrivateKeyPEM(clePriveePEM, motdepasseCle)
//
//   // console.debug("Cle Privee Chiffree")
//   // console.debug(clePriveeChiffree)
//
//   // Importer dans forge, creer certificat de MilleGrille
//   const {cert, pem: certPEM, idmg: idmgUsager} = await genererCertificatMilleGrille(clePriveePEM, clePubliquePEM)
//
//   return {
//     clePriveePEM, clePubliquePEM, cert, certPEM, idmgUsager, clePriveeChiffree, motdepasseCle
//   }
// }

// // Recupere un CSR a signer avec la cle de MilleGrille
// export async function preparerInscription(url, pkiMilleGrille) {
//   console.debug("PKI Millegrille params")
//   console.debug(pkiMilleGrille)
//
//   const {certMillegrillePEM, clePriveeMillegrilleChiffree, motdepasseCleMillegrille} = pkiMilleGrille
//
//   // Extraire PEM vers objets nodeforge
//   const certMillegrille = forgePki.certificateFromPem(certMillegrillePEM)
//   const clePriveeMillegrille = chargerClePrivee(clePriveeMillegrilleChiffree, {password: motdepasseCleMillegrille})
//
//   // Calculer IDMG a partir du certificat de millegrille
//   const idmg = calculerIdmg(certMillegrillePEM)
//
//   const parametresRequete = {nomUsager: pkiMilleGrille.nomUsager}
//   if(pkiMilleGrille.u2f) {
//     parametresRequete.u2fRegistration = true
//   }
//
//   // Aller chercher un CSR pour le nouveau compte
//   const reponsePreparation = await axios.post(url, parametresRequete)
//   console.debug("Reponse preparation inscription compte :\n%O", reponsePreparation.data)
//
//   // Creer le certificat intermediaire
//   const { csrPem: csrPEM, u2fRegistrationRequest, challengeCertificat } = reponsePreparation.data
//   const {pem: certPem} = await genererCertificatIntermediaire(idmg, certMillegrille, clePriveeMillegrille, {csrPEM})
//
//   return {
//     certPem,
//     u2fRegistrationRequest,
//     challengeCertificat,
//   }
// }

// export function genererMotdepassePartiel() {
//   // Preparer secret pour mot de passe partiel navigateur
//   const nbBytesMotdepasse = Math.ceil(Math.random() * 32) + 32  // Aleat entre 32 et 64 bytes
//   const motdepassePartiel = genererAleatoireBase64(nbBytesMotdepasse)
//   return motdepassePartiel
// }

export async function sauvegarderCertificatPem(usager, certificatPem, chainePem) {
  const nomDB = 'millegrilles.' + usager

  const db = await openDB(nomDB)

  console.debug("Sauvegarde du nouveau cerfificat de navigateur usager (%s) :\n%O", usager, certificatPem)

  const txUpdate = db.transaction('cles', 'readwrite');
  const storeUpdate = txUpdate.objectStore('cles');
  await Promise.all([
    storeUpdate.put(certificatPem, 'certificat'),
    storeUpdate.put(chainePem, 'fullchain'),
    storeUpdate.delete('csr'),
    // storeUpdate.delete('fingerprint_pk'),
    txUpdate.done,
  ])
}

export async function signerChallenge(usager, challengeJson) {

  const contenuString = stringify(challengeJson)

  const nomDB = 'millegrilles.' + usager
  const db = await openDB(nomDB)
  const tx = await db.transaction('cles', 'readonly')
  const store = tx.objectStore('cles')
  const cleSignature = (await store.get('signer'))
  await tx.done

  const signature = await new CryptageAsymetrique().signerContenuString(cleSignature, contenuString)

  return signature
}

export async function signerChallengeCertificat(clePriveeChiffree, motdepasse, challengeJson) {

  // Dechiffree la cle avec nodeforge et exporter en PEM
  const clePriveeForge = chargerClePrivee(clePriveeChiffree, {password: motdepasse})
  const clePriveePem = sauvegarderPrivateKeyToPEM(clePriveeForge)

  // Transformer en cle subtle pour signer
  const clesPriveesSubtle = await cryptageAsymetriqueHelper.preparerClePrivee(clePriveePem)
  const cleSignature = clesPriveesSubtle.clePriveeSigner

  // Signer le challenge
  const contenuString = stringify(challengeJson)
  const signature = await new CryptageAsymetrique().signerContenuString(cleSignature, contenuString)

  return signature
}

// Initialiser le contenu du navigateur
export async function initialiserNavigateur(nomUsager, opts) {
  if(!opts) opts = {}

  if( ! nomUsager ) throw new Error("Usager null")

  const nomDB = 'millegrilles.' + nomUsager
  const db = await openDB(nomDB, 2, {
    upgrade(db, oldVersion) {
      createObjectStores(db, oldVersion)
    },
  })

  // console.debug("Database %O", db)
  const tx = await db.transaction('cles', 'readonly')
  const store = tx.objectStore('cles')
  const certificat = (await store.get('certificat'))
  const fullchain = (await store.get('fullchain'))
  const fingerprintPk = (await store.get('fingerprint_pk'))
  const csr = (await store.get('csr'))
  await tx.done

  if( opts.regenerer || ( !certificat && !csr ) ) {
    console.debug("Generer nouveau CSR")
    // Generer nouveau keypair et stocker
    const keypair = await new CryptageAsymetrique().genererKeysNavigateur()
    // console.debug("Key pair : %O", keypair)

    const clePriveePem = enveloppePEMPrivee(keypair.clePriveePkcs8),
          clePubliquePem = enveloppePEMPublique(keypair.clePubliqueSpki)
    // console.debug("Cles :\n%s\n%s", clePriveePem, clePubliquePem)
    console.debug("Public key pem : %O", clePubliquePem)

    const clePriveeForge = chargerClePrivee(clePriveePem),
          clePubliqueForge = forgePki.publicKeyFromPem(clePubliquePem)

    // Calculer hachage de la cle publique
    const fingerprintPk = await hacherPem(clePubliquePem)

    // console.debug("CSR Genere : %O", resultat)
    const csrNavigateur = await genererCsrNavigateur(nomUsager, clePubliqueForge, clePriveeForge)

    console.debug("CSR Navigateur :\n%s", csrNavigateur)

    const txPut = db.transaction('cles', 'readwrite');
    const storePut = txPut.objectStore('cles');
    await Promise.all([
      storePut.put(keypair.clePriveeDecrypt, 'dechiffrer'),
      storePut.put(keypair.clePriveeSigner, 'signer'),
      storePut.put(keypair.clePublique, 'public'),
      storePut.put(csrNavigateur, 'csr'),
      storePut.put(fingerprintPk, 'fingerprint_pk'),
      txPut.done,
    ])

    return { csr: csrNavigateur, fingerprintPk }
  }

  // Verifier la validite du certificat
  var certificatValide = false
  if(certificat) {
    const certForge = forgePki.certificateFromPem(certificat)
    const validityNotAfter = certForge.validity.notAfter.getTime()
    certificatValide = new Date().getTime() < validityNotAfter
  }

  return { certificat, fullchain, csr, fingerprintPk, certificatValide}

}

// Met a jour/genere le certificat de navigateur via socket.io (mode protege)
export async function mettreAJourCertificatNavigateur(cw, opts) {
  if(!opts) opts = {}
  const DEBUG = opts.DEBUG || false

  if(DEBUG) console.debug("Verifier mettreAJourCertificatNavigateur()")

  const nomUsager = opts.nomUsager || 'proprietaire'
  const estProprietaire = opts.estProprietaire || false

  var infoCertificat = await initialiserNavigateur(nomUsager, opts)

  if(DEBUG) console.debug("CSR:%O\nCertificat:%O", infoCertificat.csr, infoCertificat.certificat)

  if(!infoCertificat.csr && infoCertificat.certificat) {
    // console.debug("Verifier si le certificat est deja valide, sinon forcer la regeneration")
    const certForge = await forgePki.certificateFromPem(infoCertificat.certificat)
    // console.debug("Cert forge: %O", certForge)
    const validityNotAfter = certForge.validity.notAfter.getTime(),
          validityNotBefore = certForge.validity.notBefore.getTime()

    if(DEBUG) console.debug("Not after : %O, not before : %O", validityNotAfter, validityNotBefore)

    // Calculer 2/3 de la duree pour trigger de renouvellement
    const validityRenew = (validityNotAfter - validityNotBefore) / 3.0 * 2.0 + validityNotBefore
    if(DEBUG) console.debug("Epoch renew : %s (%s)", validityRenew, new Date(validityRenew))

    // const validityRenew = validityNotAfter - PERIODE_1SEMAINE_MILLIS

    if (new Date().getTime() > validityRenew) {
      console.info("Date de renouvellement du certificat atteinte")
      infoCertificat = await initialiserNavigateur(nomUsager, {...opts, regenerer: true})
    } else {
      if(DEBUG) console.debug("Certificat est valide pour au moins une semaine")
    }

  }

  if(infoCertificat.csr) {
    const requeteGenerationCertificat = {
      nomUsager,
      csr: infoCertificat.csr,
      estProprietaire,
    }
    if(DEBUG) console.debug("Requete generation certificat navigateur: \n%O", requeteGenerationCertificat)

    const reponse = await cw.genererCertificatNavigateur(requeteGenerationCertificat)
    // console.debug("Reponse cert recue %O", reponse)
    var {cert: certificatNavigateur, fullchain} = reponse

    try {
      // Convertir liste en str
      fullchain = fullchain.join('\n')

      if(DEBUG) console.debug("Usager %s: certificat %O et chaine %O", nomUsager,  certificatNavigateur, fullchain)

      // Sauvegarder info dans IndexedDB du navigateur, nettoyer "csr" existant
      await sauvegarderCertificatPem(nomUsager, certificatNavigateur, fullchain)
    } catch(err) {
      console.error("Erreur preparation certificat de navigateur : %O", err)
    }

    return {certificatNavigateur, fullchain}
  } else if(infoCertificat.certificat) {
    return infoCertificat
  } else {
    console.error("CSR non genere, certificat non valide/inexistant")
  }
}

export async function resetCertificatPem(opts) {
  if(!opts) opts = {}

  const usager = opts.nomUsager || 'proprietaire'
  const nomDB = 'millegrilles.' + usager

  const db = await openDB(nomDB)
  console.debug("Reset du cerfificat de navigateur usager (%s)", usager)

  const txUpdate = db.transaction('cles', 'readwrite');
  const storeUpdate = txUpdate.objectStore('cles');
  await Promise.all([
    storeUpdate.delete('certificat'),
    storeUpdate.delete('fullchain'),
    storeUpdate.delete('csr'),
    storeUpdate.delete('signer'),
    storeUpdate.delete('dechiffrer'),
    storeUpdate.delete('public'),
    storeUpdate.delete('fingerprint_pk'),
    txUpdate.done,
  ])

}

export async function getFingerprintPk(nomUsager) {

  const nomDB = 'millegrilles.' + nomUsager
  const db = await openDB(nomDB)

  // console.debug("Database %O", db)
  const tx = await db.transaction('cles', 'readonly')
  const store = tx.objectStore('cles')
  const fingerprint_pk = (await store.get('fingerprint_pk'))
  const csr = (await store.get('csr'))
  await tx.done

  return {fingerprint_pk, csr}
}

export async function transformerClePriveeForgeVersSubtle(cleChiffree, motdepasse) {
  const clePriveeForge = chargerClePrivee(cleChiffree, {password: motdepasse})
  const clePEM = sauvegarderPrivateKeyToPEM(clePriveeForge)
  const cle = await new CryptageAsymetrique().preparerClePrivee(clePEM)
  return cle
}
