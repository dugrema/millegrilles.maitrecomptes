import {useState, useEffect, useCallback} from 'react'
import Button from 'react-bootstrap/Button'
import base64url from 'base64url'
import axios from 'axios'

import { usagerDao, BoutonActif } from '@dugrema/millegrilles.reactjs'
import { repondreRegistrationChallenge } from '@dugrema/millegrilles.reactjs/src/webauthn.js'
import { hacherMessage } from '@dugrema/millegrilles.reactjs/src/formatteurMessage'

import useWorkers, { useUsagerDb, useUsagerSocketIo } from './WorkerContext'

import { sauvegarderCertificatPem, genererCle, chargerUsager } from './comptesUtil'

export function BoutonAjouterWebauthn(props) {

    const { variant, className, resetMethodes, confirmationCb, erreurCb } = props

    const workers = useWorkers()

    const { connexion } = workers
    const usagerDb = useUsagerDb()[0]
    const nomUsager = usagerDb.nomUsager,
          fingerprintPkCourant = usagerDb.fingerprintPk

    const [challenge, setChallenge] = useState('')
    const [resultat, setResultat] = useState('')

    const onClickCb = useCallback(event=>{
        setResultat('attente')
        event.preventDefault()
        event.stopPropagation()
        
        console.debug("Ajout methode pour nomUsager %s, fingerprintPkCourant %O, challenge %O", 
            nomUsager, fingerprintPkCourant, challenge)

        ajouterMethode(connexion, nomUsager, fingerprintPkCourant, challenge, resetMethodes, {DEBUG: true})
            .then( resultat => {
                console.debug("Resultat ajouter methode : ", resultat)
                setResultat('succes')
                if(confirmationCb) confirmationCb()
            })
            .catch(err=>{
                setResultat('echec')
                erreurCb(err, 'Erreur ajouter methode')
            })
    }, [connexion, nomUsager, fingerprintPkCourant, challenge, resetMethodes, confirmationCb, erreurCb, setResultat])

    useEffect(() => {
        getChallengeAjouter(connexion)
            .then(challenge=>{
                console.debug("BoutonAjouterWebauthn Challenge registration : ", challenge)
                setChallenge(challenge)
            })
            .catch(err=>erreurCb(err, 'Erreur preparation challenge pour ajouter methode'))
    },[connexion, setChallenge, confirmationCb, erreurCb])

    return (
        <BoutonActif
            variant={variant} 
            className={className} 
            etat={resultat}
            onClick={onClickCb}
            disabled={challenge?false:true}
        >
            {props.children}
        </BoutonActif>
    )

}

export function BoutonAuthentifierWebauthn(props) {

    const { variant, className, usagerDb, challenge, dureeSession, onError, onSuccess } = props

    const workers = useWorkers()

    console.debug("BoutonAuthentifierWebauthn usagerDb %O", usagerDb)

    const { connexion } = workers
    // const { requete: requeteCsr } = usagerDbLocal
    const nomUsager = usagerDb.nomUsager
    const requeteCsr = usagerDb.requete

    const [reponseChallengeAuthentifier, setReponseChallengeAuthentifier] = useState('')
    const [attente, setAttente] = useState(false)
    const [erreur, setErreur] = useState(false)
    const handlerErreur = useCallback((err, message)=>{
        setErreur(true)
        onError(err, message)
    }, [setErreur, onError])

    const authentifierCb = useCallback( event => {
        console.debug("BoutonAuthentifierWebauthn.authentifierCb Authentifier reponseChallengeAuthentifier: %O", reponseChallengeAuthentifier)
        setErreur(false)  // Reset
        setAttente(true)
        const {demandeCertificat, publicKey} = reponseChallengeAuthentifier
        authentifier(connexion, nomUsager, demandeCertificat, publicKey, {dureeSession})
            .then(reponse=>{
                console.debug("BoutonAuthentifierWebauthn Reponse authentifier ", reponse)

                // if(reponse.cookie_disponible) {
                //     console.debug("Recuperer le cookie de session")
                //     axios({method: 'GET', url: '/millegrilles/authentification/cookie'})
                //         .then(reponse=>{
                //             console.debug("Reponse recuperer cookie de session : ", reponse)
                //         })
                //         .catch(err=>console.error("Erreur recuperation cookie de session ", err))
                // }
                onSuccess(reponse)
            })
            .catch(err=>handlerErreur(err, 'BoutonAuthentifierWebauthn.authentifierCb Erreur authentification'))
            .finally(()=>{setAttente(false)})
    }, [connexion, nomUsager, dureeSession, reponseChallengeAuthentifier, onSuccess, setAttente, setErreur, handlerErreur])

    useEffect(()=>{
        if(!challenge) return
        preparerAuthentification(nomUsager, challenge, requeteCsr)
            .then(resultat=>{
                console.debug("Reponse preparerAuthentification nomUsager %s, challenge %O, requeteCsr %s : %O", nomUsager, challenge, requeteCsr, resultat)
                setReponseChallengeAuthentifier(resultat)
            })
            .catch(err=>onError(err, 'BoutonAuthentifierWebauthn.authentifierCb Erreur preparation authentification'))
    }, [nomUsager, challenge, requeteCsr, setReponseChallengeAuthentifier, onError])

    let etatBouton = ''
    if(erreur) etatBouton = 'echec'
    else if(attente) etatBouton = 'attente'

    return (
        <BoutonActif 
            variant={variant} 
            className={className} 
            challenge={challenge}
            etat={etatBouton}
            onClick={authentifierCb}
            disabled={reponseChallengeAuthentifier?false:true}
        >
            {props.children}
        </BoutonActif>
    )
}

export function BoutonMajCertificatWebauthn(props) {

    const { 
        variant, className, usager, setAttente, onSuccess, onError,
    } = props

    const workers = useWorkers()

    const { nomUsager, requete } = usager || {}

    // const [nouvelleCleCsr, setNouvelleCleCsr] = useState('')
    const [csrChallenge, setCsrChallenge] = useState('')

    const majCertificatCb = useCallback(()=>{
        if(setAttente) setAttente(true)
        console.debug("majCertificatCb requete : %O, csrChallenge: %O", requete, csrChallenge)
        const { demandeCertificat, publicKey, challengeReference } = csrChallenge
        
        majCertificat(workers, nomUsager, demandeCertificat, publicKey, challengeReference)
            .then(reponse=>{if(onSuccess) onSuccess(reponse)})
            .catch(err=>{if(onError) onError(err); else console.error("Erreur : %O", err)})
            .finally(()=>{if(setAttente) setAttente(false)})
    }, [
        workers, nomUsager, requete, csrChallenge,
        setAttente, onSuccess, onError
    ])

    // Charger un nouveau challenge
    useEffect(()=>{
        if(!nomUsager || !requete) return
        // chargerUsager(nomUsager, null, null, {genererChallenge: true})
        //     .then(reponse=>{
        //         console.debug("BoutonMajCertificatWebauthn reponse charger usager : ", reponse)
        //         return preparerAuthentification(nomUsager, reponse.infoUsager.authentication_challenge, requete)
        //     })
        //     .then(setCsrChallenge)
        //     .catch(onError)
        const hostname = window.location.hostname
        workers.connexion.genererChallenge({hostname, webauthnAuthentication: true})
            .then(async reponse => {
                console.debug("BoutonMajCertificatWebauthn Reponse challenge ", reponse)
                const csrChallenge = await preparerAuthentification(nomUsager, reponse.authentication_challenge, requete)
                console.debug("BoutonMajCertificatWebauthn CSR Challenge ", csrChallenge)
                setCsrChallenge(csrChallenge)
            })
            .catch(onError)
        
    }, [workers, nomUsager, requete, setCsrChallenge, onError])

    return (
        <Button 
            variant={variant} 
            className={className} 
            onClick={majCertificatCb}
            disabled={csrChallenge?false:true}>
            {props.children}
        </Button>
    )
}

export async function preparerNouveauCertificat(workers, nomUsager) {
    const {connexion} = workers
    const cleCsr = await genererCle(nomUsager)
    console.debug("Nouvelle cle generee : %O", cleCsr)

    const hostname = window.location.hostname
    const infoUsager = await connexion.getInfoUsager(nomUsager, {hostname, genererChallenge: true})
    console.debug("Etat usager backend : %O", infoUsager)
    const challenge = infoUsager.authentication_challenge
    if(!challenge) return null
    const reponseChallengeAuthentifier = await preparerAuthentification(nomUsager, challenge, cleCsr)
    
    return {cleCsr, challengeWebAuthn: challenge, reponseChallengeAuthentifier}
}

async function majCertificat(workers, nomUsager, demandeCertificat, publicKey, challengeReference) {
    const {connexion} = workers
    // const reponse = await authentifier(connexion, nomUsager, demandeCertificat, publicKey, {noformat: false})

    console.debug("majCertificat signer %O / publicKey %O, challenge reference : %O", demandeCertificat, publicKey, challengeReference)
    const demandeSignee = await signerDemandeAuthentification(nomUsager, demandeCertificat, publicKey)
    
    console.debug("majCertificat Demande certificat signee avec webauthn : %O", demandeSignee)

    const commande = {
        demandeCertificat: demandeSignee.demandeCertificat,
        challenge: challengeReference,
        hostname: window.location.hostname,
        clientAssertionResponse: demandeSignee.webauthn,
    }

    const reponse = await connexion.signerCompteUsager(commande)
    return reponse
}

async function getChallengeAjouter(connexion) {
    console.debug("Charger challenge ajouter webauthn")
    
    const hostname = window.location.hostname
    /*
            const hostname = window.location.hostname
            workers.connexion.genererChallenge({
                hostname,
                webauthnAuthentication: true
            }).then(reponseChallenge=>{
                console.debug("Challenge webauthn : ", reponseChallenge)
                const authenticationChallenge = reponseChallenge.authentication_challenge
                setChallengeOriginal(authenticationChallenge.publicKey.challenge)
                return preparerAuthentification(nomUsager, authenticationChallenge, csr, {activationTierce: true})
            })
            .then(challengePrepare=>{
                console.debug("Challenge webauthn prepare : ", challengePrepare)
                setPreparationWebauthn(challengePrepare)
            })
            .catch(erreurCb)
    */

    const challengeWebauthn = await connexion.genererChallenge({
        hostname, webauthnRegistration: true
    })
    console.debug("Challenge : %O", challengeWebauthn)
    return challengeWebauthn.registration_challenge
}

async function ajouterMethode(connexion, nomUsager, fingerprintPk, challenge, resetMethodes, opts) {
    opts = opts || {}
    // console.debug("Ajouter webauthn pour usager %s", nomUsager)

    // NB : Pour que l'enregistrement avec iOS fonctionne bien, il faut que la
    //      thread de l'evenement soit la meme que celle qui declenche
    //      navigator.credentials.create({publicKey}) sous repondreRegistrationChallenge
    if(challenge.publicKey) challenge = challenge.publicKey
    const reponse = await repondreRegistrationChallenge(nomUsager, challenge, opts)
    console.debug("Reponse ajout webauthn : %O", reponse)

    const hostname = window.location.hostname

    const params = {
        reponseChallenge: reponse,
        fingerprintPk,
        hostname,
    }

    if(resetMethodes) {
        params.reset_cles = true
    }

    console.debug("reponseChallenge : %O", params)

    const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
    console.debug("Resultat ajout : %O", resultatAjout)
    if(resultatAjout.ok !== true) {
        const error = new Error("Erreur, ajout methode refusee (back-end)")
        error.reponse = resultatAjout
        throw error
    }
}

export async function preparerAuthentification(nomUsager, challengeWebauthn, requete, opts) {
    opts = opts || {}
    if(!challengeWebauthn) throw new Error("preparerAuthentification challengeWebauthn absent")
    console.debug("Preparer authentification avec : ", challengeWebauthn)

    const challengeReference = challengeWebauthn.publicKey.challenge
    const publicKey = {...challengeWebauthn.publicKey}

    // Decoder les champs base64url
    publicKey.challenge = base64url.toBuffer(publicKey.challenge)
    publicKey.allowCredentials = (publicKey.allowCredentials || []).map(cred=>{
        const idBytes = base64url.toBuffer(cred.id)
        return {
            ...cred,
            id: idBytes
        }
    })

    let demandeCertificat = null
    if(requete) {
        const csr = requete.csr || requete
        // console.debug("On va hacher le CSR et utiliser le hachage dans le challenge pour faire une demande de certificat")
        // if(props.appendLog) props.appendLog(`On va hacher le CSR et utiliser le hachage dans le challenge pour faire une demande de certificat`)
        demandeCertificat = {
            nomUsager,
            csr,
            date: Math.floor(new Date().getTime()/1000)
        }
        if(opts.activationTierce === true) demandeCertificat.activationTierce = true
        const hachageDemandeCert = await hacherMessage(demandeCertificat, {bytesOnly: true, hashingCode: 'blake2s-256'})
        console.debug("Hachage demande cert %O = %O, ajouter au challenge existant de : %O", hachageDemandeCert, demandeCertificat, publicKey.challenge)
        
        // Concatener le challenge recu (32 bytes) au hachage de la commande
        // Permet de signer la commande de demande de certificat avec webauthn
        const challengeMaj = new Uint8Array(64)
        challengeMaj.set(publicKey.challenge, 0)
        challengeMaj.set(hachageDemandeCert, 32)
        publicKey.challenge = challengeMaj

        //challenge[0] = CONST_COMMANDE_SIGNER_CSR
        //challenge.set(hachageDemandeCert, 1)  // Override bytes 1-65 du challenge
        console.debug("Challenge override pour demander signature certificat : %O", publicKey.challenge)
        // if(props.appendLog) props.appendLog(`Hachage demande cert ${JSON.stringify(hachageDemandeCert)}`)
    } 
    // else if(challenge[0] !== CONST_COMMANDE_AUTH) {
    //     console.error("Challenge[0] : %d !== %d", challenge[0], CONST_COMMANDE_AUTH)
    //     throw new Error("Erreur challenge n'est pas de type authentification (code!==1)")
    // }        

    const resultat = { publicKey, demandeCertificat, challengeReference }
    console.debug("Prep publicKey/demandeCertificat : %O", resultat)
    
    return resultat
}

async function authentifier(connexion, nomUsager, demandeCertificat, publicKey, opts) {
    // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
    //      TouchID sur iOS.
    console.debug("Signer challenge : %O (opts: %O)", publicKey, opts)
    // if(opts.appendLog) opts.appendLog(`Signer challenge`)

    opts = opts || {}
    const { dureeSession } = opts

    if(!nomUsager) throw new Error("authentifier Nom usager manquant")  // Race condition ... pas encore trouve

    const data = await signerDemandeAuthentification(nomUsager, demandeCertificat, publicKey, {connexion, dureeSession})

    // console.debug("Data a soumettre pour reponse webauthn : %O", data)
    // const resultatAuthentification = await connexion.authentifierWebauthn(data, opts)
    // console.debug("Resultat authentification : %O", resultatAuthentification)
    // // const contenu = JSON.parse(resultatAuthentification.contenu)

    console.debug("Data a soumettre pour reponse webauthn : %O", data)
    const resultatAuthentification = await axios.post('/auth/authentifier_usager', data)
    console.debug("Resultat authentification : %O", resultatAuthentification)
    const reponse = resultatAuthentification.data
    const contenu = JSON.parse(reponse.contenu)

    if(contenu.userId) {
        return contenu
    } else {
        throw new Error("WebAuthn.authentifier Erreur authentification")
    }
}

export async function signerDemandeAuthentification(nomUsager, demandeCertificat, publicKey, opts) {
    opts = opts || {}
    // const connexion = opts.connexion
    // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
    //      TouchID sur iOS.
    // console.debug("Signer challenge : %O (challengeWebauthn %O, opts: %O)", publicKey, challengeWebauthn, opts)
    // if(opts.appendLog) opts.appendLog(`Signer challenge`)

    if(!nomUsager) throw new Error("signerDemandeAuthentification Nom usager manquant")  // Race condition ... pas encore trouve

    let { dureeSession } = opts
    if(typeof(dureeSession) === 'string') {
        dureeSession = Number.parseInt(dureeSession)
    }

    // S'assurer qu'on a un challenge de type 'authentification'
    // const demandeCertificat = opts.demandeCertificat?opts.demandeCertificat:null
    const data = {nomUsager, demandeCertificat}
    if(dureeSession) data.dureeSession = dureeSession
    
    const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
    // console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)
    // if(opts.appendLog) opts.appendLog(`PublicKeyCredential signee : ${JSON.stringify(publicKeyCredentialSignee)}`)

    const reponseSignee = publicKeyCredentialSignee.response

    const reponseSerialisable = {
        // id: publicKeyCredentialSignee.rawId,
        // id64: base64.encode(new Uint8Array(publicKeyCredentialSignee.rawId)),  // String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(publicKeyCredentialSignee.rawId))),
        id64: base64url.encode(new Uint8Array(publicKeyCredentialSignee.rawId)),
        response: {
            // authenticatorData: reponseSignee.authenticatorData?base64.encode(new Uint8Array(reponseSignee.authenticatorData)):null,
            // clientDataJSON: reponseSignee.clientDataJSON?base64.encode(new Uint8Array(reponseSignee.clientDataJSON)):null,
            // signature: reponseSignee.signature?base64.encode(new Uint8Array(reponseSignee.signature)):null,
            // userHandle: reponseSignee.userHandle?base64.encode(new Uint8Array(reponseSignee.userHandle)):null,

            authenticatorData: reponseSignee.authenticatorData?base64url.encode(new Uint8Array(reponseSignee.authenticatorData)):null,
            clientDataJSON: reponseSignee.clientDataJSON?base64url.encode(new Uint8Array(reponseSignee.clientDataJSON)):null,
            signature: reponseSignee.signature?base64url.encode(new Uint8Array(reponseSignee.signature)):null,
            userHandle: reponseSignee.userHandle?base64url.encode(new Uint8Array(reponseSignee.userHandle)):null,
        },
        type: publicKeyCredentialSignee.type,
    }

    console.debug("Reponse serialisable : %O", reponseSerialisable)

    data.webauthn = reponseSerialisable
    data.challenge = publicKey.challenge

    return data
}
