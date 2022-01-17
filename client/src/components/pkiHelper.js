import stringify from 'json-stable-stringify'
import multibase from 'multibase'
import { pki as forgePki, ed25519 } from '@dugrema/node-forge'

import { getUsager, updateUsager } from '@dugrema/millegrilles.reactjs'
import { genererClePrivee, genererCsrNavigateur, chargerPemClePriveeEd25519 } from '@dugrema/millegrilles.utiljs'

export async function sauvegarderCertificatPem(usager, chainePem) {
  const certForge = forgePki.certificateFromPem(chainePem[0])  // Validation simple, format correct
  const nomUsager = certForge.subject.getField('CN').value
  const validityNotAfter = certForge.validity.notAfter.getTime()
  console.debug("Sauvegarde du nouveau cerfificat de navigateur usager %s, expiration %O", nomUsager, validityNotAfter)

  if(nomUsager !== usager) throw new Error(`Certificat pour le mauvais usager : ${nomUsager} !== ${usager}`)

  const copieChainePem = [...chainePem]
  const ca = copieChainePem.pop()

  await updateUsager(usager, {ca, certificat: copieChainePem, csr: null})
}

export async function signerChallenge(usager, challengeJson) {
  throw new Error("fix me - refact table usagers")
  // const contenuString = stringify(challengeJson)
  //
  // const db = await ouvrirDB()
  //
  // const tx = await db.transaction('cles', 'readonly')
  // const store = tx.objectStore('cles')
  // const cleSignature = (await store.get('signer'))
  // await tx.done
  //
  // const signature = await new CryptageAsymetrique().signerContenuString(cleSignature, contenuString)
  //
  // return signature
}

export async function signerChallengeCertificat(clePriveeChiffree, motdepasse, challengeJson) {

  throw new Error("fix me")

  // // Dechiffree la cle avec nodeforge et exporter en PEM
  // const clePriveeForge = chargerClePrivee(clePriveeChiffree, {password: motdepasse})
  // const clePriveePem = sauvegarderPrivateKeyToPEM(clePriveeForge)

  // // Transformer en cle subtle pour signer
  // const clesPriveesSubtle = await cryptageAsymetriqueHelper.preparerClePrivee(clePriveePem)
  // const cleSignature = clesPriveesSubtle.clePriveeSigner

  // // Signer le challenge
  // const contenuString = stringify(challengeJson)
  // const signature = await new CryptageAsymetrique().signerContenuString(cleSignature, contenuString)

  // return signature
}

// Initialiser le contenu du navigateur
export async function initialiserNavigateur(nomUsager, opts) {
  if(!opts) opts = {}

  if( ! nomUsager ) throw new Error("Usager null")

  // Charger usager avec upgrade - initialiserNavigateur devrait etre la
  // premiere methode qui accede a la base de donnees.
  let usager = await getUsager(nomUsager, {upgrade: true})
  let genererCsr = false

  console.debug("initialiserNavigateur Information usager initiale : %O", usager)

  if(!usager) {
    console.debug("Nouvel usager, initialiser compte et creer CSR %s", nomUsager)
    genererCsr = true
  } else {
    // console.debug("Usager charge : %O", usager)
    if( opts.regenerer || ( !usager.certificat && !usager.csr ) ) {
      console.debug("Generer nouveau CSR pour usager %s", nomUsager)
      genererCsr = true
    } else if(usager.certificat) {
      // Verifier la validite du certificat
      const certForge = forgePki.certificateFromPem(usager.certificat.join(''))

      const validityNotAfter = certForge.validity.notAfter.getTime(),
            validityNotBefore = certForge.validity.notBefore.getTime()
      const certificatValide = new Date().getTime() < validityNotAfter

      // Calculer 2/3 de la duree pour trigger de renouvellement
      const validityRenew = (validityNotAfter - validityNotBefore) / 3.0 * 2.0 + validityNotBefore
      const renewDateAtteinte = new Date().getTime() > validityRenew

      console.debug(
        "Certificat valide presentement : %s, epoch renew? (%s) : %s (%s)",
        certificatValide, renewDateAtteinte, validityRenew, new Date(validityRenew)
      )

      if(renewDateAtteinte || !certificatValide) {
        // Generer nouveau certificat
        console.debug("Certificat invalide ou date de renouvellement atteinte")
        genererCsr = true
      } else {
        // Ajouter info certificat a l'usager
        usager.certForge = certForge
        usager.validityNotAfter = validityNotAfter
      }
    }
  }

  if(genererCsr) {
    const nouvellesCles = await genererCle(nomUsager)
    await updateUsager(nomUsager, nouvellesCles)
    usager = {...usager, ...nouvellesCles}
  }

  console.debug("Compte usager : %O", usager)

  return usager
}

async function genererCle(nomUsager) {
    console.debug("Generer nouveau CSR")

    // Generer nouveau keypair et stocker
    const cles = await genererClePrivee()

    // Extraire cles, generer CSR du navigateur
    const clePubliqueBytes = String.fromCharCode.apply(null, multibase.encode('base64', cles.publicKey.publicKeyBytes))
    // const clePriveeBytes = String.fromCharCode.apply(null, multibase.encode('base64', cles.privateKey.privateKeyBytes))
    const csrNavigateur = await genererCsrNavigateur(nomUsager, cles.pem)
    console.debug("Nouveau cert public key bytes : %s\nCSR Navigateur :\n%s", clePubliqueBytes, csrNavigateur)

    return {
      certificatValide: false,
      fingerprint_pk: clePubliqueBytes, 
      csr: csrNavigateur,

      clePriveePem: cles.pem,

      certificat: null,  // Reset certificat s'il est present

      // fingerprintPk,
      // dechiffrer: keypair.clePriveeDecrypt,
      // signer: keypair.clePriveeSigner,
      // publique: keypair.clePublique,
    }
}

// Met a jour/genere le certificat de navigateur via socket.io (mode protege)
export async function mettreAJourCertificatNavigateur(cw, nomUsager, opts) {
  if(!opts) opts = {}
  const DEBUG = opts.DEBUG || false

  if(DEBUG) console.debug("Verifier mettreAJourCertificatNavigateur()")

  const usager = await initialiserNavigateur(nomUsager, opts)

  if(DEBUG) console.debug("CSR:%O\nCertificat:%O", usager.csr, usager.certificat)

  // if(!usager.csr && usager.certificat) {
  //   // console.debug("Verifier si le certificat est deja valide, sinon forcer la regeneration")
  //   const certForge = await forgePki.certificateFromPem(infoCertificat.certificat)
  //   // console.debug("Cert forge: %O", certForge)
  //   const validityNotAfter = certForge.validity.notAfter.getTime(),
  //         validityNotBefore = certForge.validity.notBefore.getTime()
  //
  //   if(DEBUG) console.debug("Not after : %O, not before : %O", validityNotAfter, validityNotBefore)
  //
  //   // Calculer 2/3 de la duree pour trigger de renouvellement
  //   const validityRenew = (validityNotAfter - validityNotBefore) / 3.0 * 2.0 + validityNotBefore
  //   if(DEBUG) console.debug("Epoch renew : %s (%s)", validityRenew, new Date(validityRenew))
  //
  //   // const validityRenew = validityNotAfter - PERIODE_1SEMAINE_MILLIS
  //
  //   if (new Date().getTime() > validityRenew) {
  //     console.info("Date de renouvellement du certificat atteinte")
  //     infoCertificat = await initialiserNavigateur(nomUsager, {...opts, regenerer: true})
  //   } else {
  //     if(DEBUG) console.debug("Certificat est valide pour au moins une semaine")
  //   }
  //
  // }

  if(usager.csr) {
    const requeteGenerationCertificat = {
      nomUsager,
      csr: usager.csr,
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
      await sauvegarderCertificatPem(nomUsager, fullchain)
    } catch(err) {
      console.error("Erreur preparation certificat de navigateur : %O", err)
    }

    return {...usager, certificat: fullchain}
  } else if(usager.certificat) {
    return usager
  } else {
    console.error("CSR non genere, certificat non valide/inexistant")
  }
}

export async function resetCertificatPem(opts) {
  if(!opts) opts = {}

  throw new Error("fix me - refact table usagers")

  // const usager = opts.nomUsager
  // const db = await ouvrirDB()
  // console.debug("Reset du cerfificat de navigateur usager (%s)", usager)
  //
  // const txUpdate = db.transaction('cles', 'readwrite');
  // const storeUpdate = txUpdate.objectStore('cles');
  // await Promise.all([
  //   storeUpdate.delete('certificat'),
  //   storeUpdate.delete('fullchain'),
  //   storeUpdate.delete('csr'),
  //   storeUpdate.delete('signer'),
  //   storeUpdate.delete('dechiffrer'),
  //   storeUpdate.delete('public'),
  //   storeUpdate.delete('fingerprint_pk'),
  //   txUpdate.done,
  // ])

}

// export async function getFingerprintPk(nomUsager) {
//
//   const nomDB = 'millegrilles.' + nomUsager
//   const db = await ouvrirDB({upgrade: true})
//
//   // console.debug("Database %O", db)
//   const tx = await db.transaction('cles', 'readonly')
//   const store = tx.objectStore('cles')
//   const fingerprint_pk = (await store.get('fingerprint_pk'))
//   const csr = (await store.get('csr'))
//   await tx.done
//
//   return {fingerprint_pk, csr}
// }

// export async function transformerClePriveeForgeVersSubtle(cleChiffree, motdepasse) {
//   const clePriveeForge = chargerClePrivee(cleChiffree, {password: motdepasse})
//   const clePEM = sauvegarderPrivateKeyToPEM(clePriveeForge)
//   const cle = await new CryptageAsymetrique().preparerClePrivee(clePEM)
//   return cle
// }

export async function transformerClePriveeForge(cleChiffree, motdepasse, opts) {
  opts = opts || {}
  const clePriveeForge = chargerPemClePriveeEd25519(cleChiffree, {...opts, password: motdepasse})
  return clePriveeForge
}
