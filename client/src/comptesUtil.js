import { usagerDao } from '@dugrema/millegrilles.reactjs'
import { base64 } from 'multiformats/bases/base64'

import { extraireExtensionsMillegrille } from '@dugrema/millegrilles.utiljs/src/forgecommon'
import { genererClePrivee, genererCsrNavigateur } from '@dugrema/millegrilles.utiljs/src/certificats'

import { pki as forgePki } from '@dugrema/node-forge'

export async function sauvegarderCertificatPem(usager, chainePem, dataAdditionnel) {
    dataAdditionnel = dataAdditionnel || {}

    const certForge = forgePki.certificateFromPem(chainePem[0])  // Validation simple, format correct
    const nomUsager = certForge.subject.getField('CN').value
    const validityNotAfter = certForge.validity.notAfter.getTime()
    console.debug("Sauvegarde du nouveau cerfificat de navigateur usager %s, expiration %O", nomUsager, validityNotAfter)
  
    if(nomUsager !== usager) throw new Error(`Certificat pour le mauvais usager : ${nomUsager} !== ${usager}`)
  
    const copieChainePem = [...chainePem]
    if(copieChainePem.length !==3) throw new Error(`Certificat recu n'a pas intermediaire/CA (len=${chainePem.length}): ${chainePem.join('')}`)
    const ca = copieChainePem.pop()
  
    await usagerDao.updateUsager(usager, {ca, certificat: copieChainePem, ...dataAdditionnel, csr: null})
}

export function getUserIdFromCertificat(certificat) {
    let certForge = certificat
    if(typeof(certificat) === 'string') {
        certForge = forgePki.certificateFromPem(certificat)
    }
    const extensions = extraireExtensionsMillegrille(certForge)
    const userId = extensions.userId
    return userId
}

export async function genererCle(nomUsager) {
    // Generer nouveau keypair et stocker
    const cles = await genererClePrivee()

    // Extraire cles, generer CSR du navigateur
    // const clePubliqueBytes = String.fromCharCode.apply(null, multibase.encode('base64', cles.publicKey.publicKeyBytes))
    const clePubliqueBytes = base64.encode(cles.publicKey.publicKeyBytes)
    const csrNavigateur = await genererCsrNavigateur(nomUsager, cles.pem)

    return {
        fingerprint_pk: clePubliqueBytes, 
        csr: csrNavigateur,
        clePriveePem: cles.pem,
        certificat: null,  // Reset certificat s'il est present
    }
}
