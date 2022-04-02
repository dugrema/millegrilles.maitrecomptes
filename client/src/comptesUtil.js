import { 
    usagerDao, 
} from '@dugrema/millegrilles.reactjs'

import { extraireExtensionsMillegrille } from '@dugrema/millegrilles.utiljs/src/forgecommon'

import { pki as forgePki } from '@dugrema/node-forge'

export async function sauvegarderCertificatPem(usager, chainePem) {
    const certForge = forgePki.certificateFromPem(chainePem[0])  // Validation simple, format correct
    const nomUsager = certForge.subject.getField('CN').value
    const validityNotAfter = certForge.validity.notAfter.getTime()
    console.debug("Sauvegarde du nouveau cerfificat de navigateur usager %s, expiration %O", nomUsager, validityNotAfter)
  
    if(nomUsager !== usager) throw new Error(`Certificat pour le mauvais usager : ${nomUsager} !== ${usager}`)
  
    const copieChainePem = [...chainePem]
    const ca = copieChainePem.pop()
  
    await usagerDao.updateUsager(usager, {ca, certificat: copieChainePem, csr: null})
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
