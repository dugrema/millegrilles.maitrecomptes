import React, { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import {proxy} from 'comlink'

import Alert from 'react-bootstrap/Alert'

import { BoutonMajCertificatWebauthn, preparerNouveauCertificat } from './WebAuthn'

import useWorkers, { useEtatPret, useUsagerDb, useEtatConnexion, useUsagerWebAuth, useEtatSocketioAuth, useVersionCertificat } from './WorkerContext'
import { sauvegarderCertificatPem } from './comptesUtil'

function UpdateCertificat(props) {
    const { confirmationCb, erreurCb, disabled } = props
    // console.debug("UpdateCertificat proppies %O", props)
  
    // const { infoUsagerBackend, setInfoUsagerBackend, confirmationCb, erreurCb, disabled } = props
  
    const workers = useWorkers(),
          etatPret = useEtatPret(),
          etatConnexion = useEtatConnexion(),
          etatSocketioAuth = useEtatSocketioAuth()

    const [usagerDb, setUsagerDb] = useUsagerDb()
    const [usagerWebAuth, setUsagerWebAuth] = useUsagerWebAuth()
    const [versionCertificat, setVersionCertificat] = useVersionCertificat()
  
    // Verifier si usagerDb.delegations_version est plus vieux que webauth.infoUsager.delegations_versions
    const versionObsolete = useMemo(()=>{
        if( disabled || !usagerDb ) return false
        console.debug("UpdateCertificat verifier version obsolete : usagerDb %O, usagerSocketIo %O, versionCertificat %O", 
            usagerDb, versionCertificat)
        return verifierMajCertificat(usagerDb, versionCertificat)
    }, [disabled, usagerDb, versionCertificat])
  
    const majUsagerHandler = useMemo(() => {
        const cb = e => {
          console.debug("Applications Reception maj usager ", e)
          const message = e.message || {}
          const delegations_version = message.delegations_version || ''
          const delegations_date = message.delegations_date || ''
          setVersionCertificat({delegations_version, delegations_date})
        }
        return proxy(cb)
    }, [setVersionCertificat])
    
    const confirmationCertificatCb = useCallback( resultat => {
        console.debug("UpdateCertificat Resultat update certificat : %O, versionCertificat %O", resultat, versionCertificat)
        const nomUsager = usagerDb.nomUsager
        const requete = usagerDb.requete
        if(resultat.ok) {
            const { clePriveePem, fingerprintPk } = requete
            const dataAdditionnel = {
                clePriveePem, fingerprintPk, 
                delegations_version: versionCertificat.delegations_version,
                delegations_date: versionCertificat.delegations_date,
            }
            sauvegarderCertificatPem(nomUsager, resultat.certificat, dataAdditionnel)
                .then( async ()=>{
                    if(confirmationCb) confirmationCb('Certificat mis a jour')
        
                    // Mettre a jour l'information de l'usager DB
                    const infoMaj = await workers.usagerDao.getUsager(nomUsager)
                    setUsagerDb(infoMaj)
                })
                .catch(erreurCb)
        } else {
            erreurCb('Erreur mise a jour certificat : ' + resultat.err)
        }
    }, [workers, usagerDb, setUsagerDb, versionCertificat, confirmationCb, erreurCb])
  
    // Ecouter les changements du compte usager
    useEffect(()=>{
        if(!etatPret || !etatConnexion || !etatSocketioAuth) return
        
        workers.connexion.enregistrerCallbackEvenementsCompteUsager(majUsagerHandler)
            .catch(err=>console.error("Erreur enregistrement listener compte usager", err))
        return () => {
            workers.connexion.retirerCallbackEvenementsCompteUsager(majUsagerHandler)
                .catch(err=>console.error("Erreur retrait listener compte usager", err))
        }
    }, [workers, majUsagerHandler, etatPret, etatConnexion, etatSocketioAuth])

    // Load usagerWebAuth si non disponible
    useEffect(()=>{
        if(usagerWebAuth || !usagerDb) return
        // console.debug("Applications usagerDb : ", usagerDb)
        const nomUsager = usagerDb.nomUsager,
              fingerprintPkCourant = usagerDb.fingerprintPk

        // Charger usagerWebAuth, utiliser fingerprintPk courant pour verifier sont etat d'activation
        axios({method: 'POST', url: '/auth/get_usager', data: {nomUsager, hostname: window.location.hostname, fingerprintPkCourant}})
            .then(reponse=>{
                const contenu = JSON.parse(reponse.data.contenu)
                // console.debug("Applications Chargement get_usager, setUsagerWebAuth ", contenu)
                setUsagerWebAuth({authentifie: contenu.auth, nomUsager, infoUsager: contenu})
            })
            .catch(err=>console.error("Erreur chargement usager ", err))
    }, [workers, usagerDb, usagerWebAuth, setUsagerWebAuth])

    // Generer un nouveau CSR au besoin
    useEffect(()=>{
        if(versionObsolete) {
            console.debug("UpdateCertificat (usager: %O)", usagerDb)
    
            const requete = usagerDb.requete || {}
            if(!requete.fingerprintPk) {
                // console.debug("UpdateCertificat Generer nouveau certificat pour ", usagerDb)
                const nomUsager = usagerDb.nomUsager
                preparerNouveauCertificat(workers, nomUsager)
                .then(async nouvellesCles => {
                    // console.debug("UpdateCertificat Cle challenge/csr : %O", nouvellesCles)
                    if(nouvellesCles) {
                        const {csr, clePriveePem, fingerprint_pk} = nouvellesCles.cleCsr
                        const requete = {csr, clePriveePem, fingerprintPk: fingerprint_pk}
                        await workers.usagerDao.updateUsager(nomUsager, {nomUsager, requete})
                        setUsagerDb({...usagerDb, requete})
                    }
                })
                .catch(erreurCb)
            }
        }
    }, [workers, versionObsolete, usagerDb, setUsagerDb, erreurCb, disabled])
  
    if(!usagerDb || !usagerDb.nomUsager) return ''
  
    return (
        <Alert variant='info' show={versionObsolete && !disabled}>
            <Alert.Heading>Nouveau certificat disponible</Alert.Heading>
            <p>
                De nouvelles informations ou droits d'acces sont disponibles pour votre compte. 
                Cliquez sur le bouton <i>Mettre a jour</i> et suivez les instructions pour mettre a jour 
                le certificat de securite sur ce navigateur.
            </p>
  
            <BoutonMajCertificatWebauthn 
                usager={usagerDb}
                onSuccess={confirmationCertificatCb}
                onError={erreurCb}            
                variant="secondary">
                Mettre a jour
            </BoutonMajCertificatWebauthn>
        </Alert>
    )
}
  
export default UpdateCertificat  

export function verifierMajCertificat(usagerDb, versionCertificat) {

    const versionDb = usagerDb.delegations_version || 0

    const delegations_version = versionCertificat.delegations_version
    const delegations_date = versionCertificat.delegations_date

    console.debug("verifierMajCertificat Delegations version : %s, date: %s", delegations_version, delegations_date)
    if(delegations_version) {
        const versionCompte = delegations_version || 0
        console.debug("UpdateCertificat Version delegations db %d, compte %d", versionDb, versionCompte)
        return versionDb < versionCompte
    } 

    return false
}

export async function majCertificatUsager(usagerDb) {
    if(usagerDb) {
        // Faire un chargement en differe de l'information dans infoVersion.
        const nomUsager = usagerDb.nomUsager
        const requete = usagerDb.requete || {}
        const fingerprintPkNouveau = requete.fingerprintPk
        // console.debug("UpdateCertificat getInfoUsager pour %s", nomUsager)
        // workers.connexion.getInfoUsager(nomUsager, {hostname: window.location.hostname, fingerprintPkNouveau})
        //     .then(async infoVersionReponse => {
        //     // console.debug("UpdateCertificat Reception infoVersion : ", infoVersionReponse)
        //     if(infoVersionReponse.ok === true) {
        //         const infoUsager = usagerWebAuth.infoUsager?{...usagerWebAuth.infoUsager}:{}
        //         const compte = infoVersionReponse.compte

        //         // Verifier reception de nouveau certificat en attachement
        //         // Mettre a jour usagerDb directement si certificat match
        //         if(infoVersionReponse['__original'].attachements && infoVersionReponse['__original'].attachements.certificat) {
        //             const messageCertificat = infoVersionReponse['__original'].attachements.certificat
        //             const contenuMessageCertificat = JSON.parse(messageCertificat.contenu)
        //             if(contenuMessageCertificat.chaine_pem) {
        //                 console.info("Nouveau certificat recu en attachement")
        //                 const {chaine_pem, fingerprint} = contenuMessageCertificat
        //                 // S'assurer que le fingerprint match celui de la requete
        //                 if(fingerprintPkNouveau === fingerprint) {
        //                     console.debug("Certificat match requete, on conserve")
        //                     const { clePriveePem, fingerprintPk } = requete
        //                     const dataAdditionnel = {
        //                         clePriveePem, fingerprintPk, 
        //                         delegations_version: compte.delegations_version,
        //                         delegations_date: compte.delegations_date,
        //                     }
        //                     await sauvegarderCertificatPem(nomUsager, chaine_pem, dataAdditionnel)

        //                     // Mettre a jour l'information de l'usager DB
        //                     const infoMaj = await workers.usagerDao.getUsager(nomUsager)
        //                         setUsagerDb(infoMaj)
        //                 }
        //             }
        //         }

        //         infoUsager.delegations_version = 0  // Evite une boucle infinie en cas de reponse sans delegations_version
        //         Object.assign(infoUsager, infoVersionReponse.compte)
        //         setUsagerWebAuth({...usagerWebAuth, infoUsager})
        //     }
        //     })
        //     .catch(erreurCb)
    }
}
